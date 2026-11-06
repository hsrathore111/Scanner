import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CustomerInfo } from 'react-native-purchases';

import { FREE_SCANS } from '@/constants/config';
import { auth, db } from '@/lib/firebase';
import { configurePurchases, getCustomerInfo, isPro as hasPro, onCustomerInfo } from '@/lib/purchases';

const ONBOARDED_KEY = 'heirloom.onboarded.v1';
const AI_CONSENT_KEY = 'heirloom.ai-consent.v1';

type AppState = {
  ready: boolean;
  user: User | null;
  authError: string | null;
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  setCustomerInfo: (info: CustomerInfo) => void;
  scansUsed: number;
  freeScansLeft: number;
  canScan: boolean;
  onboarded: boolean;
  completeOnboarding: () => Promise<void>;
  retryAuth: () => void;
  /** Apple guideline 5.1.2(i): explicit permission before photos go to a third-party AI service. */
  aiConsent: boolean;
  giveAiConsent: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [scansUsed, setScansUsed] = useState(0);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [aiConsent, setAiConsent] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(false));
    AsyncStorage.getItem(AI_CONSENT_KEY)
      .then((v) => setAiConsent(v === '1'))
      .catch(() => {});
  }, []);

  // Anonymous Firebase account: no sign-up friction. The uid doubles as the RevenueCat user id.
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthChecked(true);
        return;
      }
      setUser(null);
      signInAnonymously(auth)
        .then(() => setAuthError(null))
        .catch((e) => {
          setAuthError(e?.message ?? 'Could not connect.');
          setAuthChecked(true);
        });
    });
  }, [authAttempt]);

  useEffect(() => {
    if (!user) return;
    let offInfo = () => {};
    let live = true;
    configurePurchases(user.uid)
      .then(() => {
        if (!live) return;
        offInfo = onCustomerInfo(setCustomerInfo);
        return getCustomerInfo().then((info) => live && info && setCustomerInfo(info));
      })
      .catch(() => {});
    const offUser = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => setScansUsed((snap.data()?.scanCount as number | undefined) ?? 0),
      () => {},
    );
    return () => {
      live = false;
      offInfo();
      offUser();
    };
  }, [user]);

  const completeOnboarding = useCallback(async () => {
    setOnboarded(true);
    await AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
  }, []);

  const giveAiConsent = useCallback(async () => {
    setAiConsent(true);
    await AsyncStorage.setItem(AI_CONSENT_KEY, '1').catch(() => {});
  }, []);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setAuthAttempt((n) => n + 1);
  }, []);

  const value = useMemo<AppState>(() => {
    const pro = hasPro(customerInfo);
    const left = Math.max(0, FREE_SCANS - scansUsed);
    return {
      ready: authChecked && onboarded !== null,
      user,
      authError,
      isPro: pro,
      customerInfo,
      setCustomerInfo,
      scansUsed,
      freeScansLeft: left,
      canScan: pro || left > 0,
      onboarded: !!onboarded,
      completeOnboarding,
      retryAuth,
      aiConsent,
      giveAiConsent,
    };
  }, [authChecked, onboarded, user, authError, customerInfo, scansUsed, completeOnboarding, retryAuth, aiConsent, giveAiConsent]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
