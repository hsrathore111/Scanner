import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Screen, T, type IconName } from '@/components/ui';
import { FREE_SCANS, LEGAL, PRO_ENTITLEMENT } from '@/constants/config';
import { Colors, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
import { appleSignInAvailable, deleteAccount, isSignedIn, signInWithApple, signOut } from '@/lib/account';
import { restore } from '@/lib/purchases';

function Row({ icon, label, onPress, detail }: { icon: IconName; label: string; onPress: () => void; detail?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={Colors.inkSoft} />
      <T style={{ flex: 1, color: Colors.ink }}>{label}</T>
      {detail ? <T variant="caption">{detail}</T> : null}
      <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
    </Pressable>
  );
}

export default function Settings() {
  const { isPro, customerInfo, setCustomerInfo, freeScansLeft, user } = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [appleReady, setAppleReady] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ent = customerInfo?.entitlements.active[PRO_ENTITLEMENT];

  useFocusEffect(useCallback(() => setSignedIn(isSignedIn()), []));
  useEffect(() => {
    appleSignInAvailable().then(setAppleReady).catch(() => {});
  }, []);

  const onRestore = async () => {
    setRestoring(true);
    setMsg(null);
    const res = await restore();
    setRestoring(false);
    if (res.ok) {
      setCustomerInfo(res.info);
      setMsg(res.info.entitlements.active[PRO_ENTITLEMENT] ? 'Pro restored.' : 'No active subscription found.');
    } else if (!res.cancelled) {
      setMsg(res.message);
    }
  };

  const onApple = async () => {
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      if (await signInWithApple()) {
        setSignedIn(isSignedIn());
        setAccountMsg('Your collection is now backed up to your Apple ID.');
      }
    } catch (e) {
      setAccountMsg((e as Error)?.message ?? 'Could not sign in.');
    } finally {
      setAccountBusy(false);
    }
  };

  const onSignOut = async () => {
    setAccountBusy(true);
    await signOut().catch(() => {});
    setSignedIn(false);
    setAccountBusy(false);
  };

  const onDeleteAccount = async () => {
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      await deleteAccount();
      setConfirmDelete(false);
      setSignedIn(false);
      setAccountMsg('Your account and data have been deleted.');
    } catch {
      setAccountMsg('Could not delete your account. Check your connection and try again.');
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <T variant="title">Settings</T>

      <Card>
        <View style={styles.planRow}>
          <T variant="heading">Your plan</T>
          {isPro ? <Pill label="Pro" tone="brass" icon="star" /> : <Pill label="Free" />}
        </View>
        {isPro ? (
          <T>
            {ent?.expirationDate
              ? `${ent.willRenew ? 'Renews' : 'Ends'} ${new Date(ent.expirationDate).toLocaleDateString('en-US')}`
              : 'Active'}
          </T>
        ) : (
          <T>{freeScansLeft} of {FREE_SCANS} free scans left.</T>
        )}
        {isPro ? (
          customerInfo?.managementURL ? (
            <Button title="Manage or cancel subscription" variant="secondary" onPress={() => Linking.openURL(customerInfo.managementURL!)} />
          ) : null
        ) : (
          <Button title="Upgrade to Pro" icon="star" onPress={() => router.push('/paywall')} />
        )}
        <Button title={restoring ? 'Restoring…' : 'Restore purchases'} variant="ghost" onPress={onRestore} disabled={restoring} />
        {msg ? <T variant="caption">{msg}</T> : null}
      </Card>

      <Card>
        <T variant="heading">Account</T>
        {signedIn ? (
          <>
            <T>Signed in. Your collection is backed up and available on your other devices.</T>
            <Button title="Sign out" variant="secondary" onPress={onSignOut} disabled={accountBusy} />
          </>
        ) : (
          <>
            <T>Back up your collection so it's safe if you change phones or reinstall the app.</T>
            {appleReady ? <Button title="Sign in with Apple" icon="logo-apple" onPress={onApple} loading={accountBusy} /> : null}
          </>
        )}
        {confirmDelete ? (
          <View style={styles.danger}>
            <T style={{ color: Colors.ink }}>
              This permanently deletes your account, collection and photos. It doesn't cancel a subscription: cancel that in your
              Apple ID settings first.
            </T>
            <View style={styles.inline}>
              <Button title="Keep account" variant="secondary" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
              <Button title="Delete" onPress={onDeleteAccount} loading={accountBusy} style={{ flex: 1, backgroundColor: Colors.danger }} />
            </View>
          </View>
        ) : (
          <Button title="Delete account and data" variant="ghost" onPress={() => setConfirmDelete(true)} />
        )}
        {accountMsg ? <T variant="caption">{accountMsg}</T> : null}
      </Card>

      <Card style={{ paddingVertical: Space.sm, gap: 0 }}>
        <Row icon="mail-outline" label="Contact support" onPress={() => Linking.openURL(`mailto:${LEGAL.supportEmail}`)} />
        <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(LEGAL.privacyUrl)} />
        <Row icon="document-text-outline" label="Terms of use" onPress={() => WebBrowser.openBrowserAsync(LEGAL.termsUrl)} />
      </Card>

      <T variant="caption">
        Values are automated estimates based on your photos and public sales data. They are not certified appraisals and don't
        authenticate items. For insurance, estate or tax purposes on valuable items, consult a qualified appraiser.
      </T>
      <T variant="caption">
        Version {Constants.expoConfig?.version ?? '1.0.0'}
        {user ? ` · ID ${user.uid.slice(0, 8)}` : ''}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  danger: { gap: Space.md, backgroundColor: Colors.dangerTint, borderRadius: 12, padding: Space.md },
});
