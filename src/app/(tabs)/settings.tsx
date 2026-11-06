import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Screen, T, type IconName } from '@/components/ui';
import { FREE_SCANS, LEGAL, PRO_ENTITLEMENT } from '@/constants/config';
import { Colors, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
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
  const ent = customerInfo?.entitlements.active[PRO_ENTITLEMENT];

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
            <Button title="Manage subscription" variant="secondary" onPress={() => Linking.openURL(customerInfo.managementURL!)} />
          ) : null
        ) : (
          <Button title="Upgrade to Pro" icon="star" onPress={() => router.push('/paywall')} />
        )}
        <Button title={restoring ? 'Restoring…' : 'Restore purchases'} variant="ghost" onPress={onRestore} disabled={restoring} />
        {msg ? <T variant="caption">{msg}</T> : null}
      </Card>

      <Card style={{ paddingVertical: Space.sm, gap: 0 }}>
        <Row icon="mail-outline" label="Contact support" detail={LEGAL.supportEmail} onPress={() => Linking.openURL(`mailto:${LEGAL.supportEmail}`)} />
        <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(LEGAL.privacyUrl)} />
        <Row icon="document-text-outline" label="Terms of use" onPress={() => WebBrowser.openBrowserAsync(LEGAL.termsUrl)} />
      </Card>

      <T variant="caption">
        Values are automated estimates based on your photos and public sales data. They are not certified
        appraisals and don't authenticate items. For insurance, estate or tax purposes on valuable items,
        consult a qualified appraiser.
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
});
