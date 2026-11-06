import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CustomerInfo } from 'react-native-purchases';

import { FREE_SCANS } from '@/constants/config';
import { auth, db } from '@/lib/firebase';
import { configurePurchases, getCustomerInfo, isPro as hasPro, onCustomerInfo } from '@/lib/purchases';

const ONBOARDED_KEY = 'heirloom.onboarded.v1';

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

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(false));
  }, []);

  // Anonymous Firebase account: no sign-up friction. The uid doubles as the RevenueCat user id.
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthChecked(true);
        return;
      }
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
    configurePurchases(user.uid);
    getCustomerInfo().then((info) => info && setCustomerInfo(info)).catch(() => {});
    const offInfo = onCustomerInfo(setCustomerInfo);
    const offUser = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => setScansUsed((snap.data()?.scanCount as number | undefined) ?? 0),
      () => {},
    );
    return () => {
      offInfo();
      offUser();
    };
  }, [user]);

  const completeOnboarding = useCallback(async () => {
    setOnboarded(true);
    await AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
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
    };
  }, [authChecked, onboarded, user, authError, customerInfo, scansUsed, completeOnboarding, retryAuth]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
