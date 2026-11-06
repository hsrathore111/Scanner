import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { Bullet, Button, Screen, T } from '@/components/ui';
import { FREE_SCANS, LEGAL } from '@/constants/config';
import { Colors, Radius, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
import { buyPackage, getSubscriptionPackages, isPro, purchasesAvailable, restore } from '@/lib/purchases';

function packageCopy(pkg: PurchasesPackage) {
  const p = pkg.product;
  switch (pkg.packageType) {
    case 'ANNUAL': {
      const perWeek = p.pricePerWeekString;
      return { title: 'Yearly', subtitle: perWeek ? `${p.priceString}/year · ${perWeek}/week` : `${p.priceString}/year`, badge: 'Best value' };
    }
    case 'MONTHLY':
      return { title: 'Monthly', subtitle: `${p.priceString}/month`, badge: null };
    case 'WEEKLY':
      return { title: 'Weekly', subtitle: `${p.priceString}/week`, badge: null };
    default:
      return { title: p.title, subtitle: p.priceString, badge: null };
  }
}

function trialText(pkg: PurchasesPackage | undefined): string | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const unit = intro.periodUnit.toLowerCase();
  return `${intro.periodNumberOfUnits}-${unit} free trial`;
}

export default function Paywall() {
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { completeOnboarding, setCustomerInfo, freeScansLeft } = useApp();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSubscriptionPackages()
      .then((pkgs) => {
        const order = ['ANNUAL', 'MONTHLY', 'WEEKLY'];
        const sorted = [...pkgs].sort((a, b) => order.indexOf(a.packageType) - order.indexOf(b.packageType));
        setPackages(sorted);
        setSelected(sorted[0]?.identifier ?? null);
      })
      .catch((e) => {
        setPackages([]);
        setError(e?.message ?? 'Could not load plans.');
      });
  }, []);

  const close = async () => {
    if (source === 'onboarding') {
      await completeOnboarding();
      router.replace('/');
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const chosen = packages?.find((p) => p.identifier === selected);
  const trial = trialText(chosen);

  const onBuy = async () => {
    if (!chosen) return;
    setBusy('buy');
    setError(null);
    const res = await buyPackage(chosen);
    setBusy(null);
    if (res.ok) {
      setCustomerInfo(res.info);
      if (isPro(res.info)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await close();
      }
    } else if (!res.cancelled) {
      setError(res.message);
    }
  };

  const onRestore = async () => {
    setBusy('restore');
    setError(null);
    const res = await restore();
    setBusy(null);
    if (res.ok) {
      setCustomerInfo(res.info);
      if (isPro(res.info)) await close();
      else setError('No active subscription found for this account.');
    } else if (!res.cancelled) {
      setError(res.message);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={{ gap: Space.sm }}>
          {error ? <T style={{ color: Colors.danger, textAlign: 'center' }}>{error}</T> : null}
          <Button
            title={trial ? `Start ${trial}` : 'Continue'}
            onPress={onBuy}
            loading={busy === 'buy'}
            disabled={!chosen || !!busy}
          />
          <T variant="caption" style={{ textAlign: 'center' }}>
            {trial && chosen
              ? `Then ${packageCopy(chosen).subtitle.split(' · ')[0]}. Cancel anytime in Settings.`
              : 'Auto-renews. Cancel anytime in Settings.'}
          </T>
          <View style={styles.legalRow}>
            <Pressable onPress={onRestore} disabled={!!busy} hitSlop={8}>
              <T variant="caption" style={styles.link}>{busy === 'restore' ? 'Restoring…' : 'Restore'}</T>
            </Pressable>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(LEGAL.termsUrl)} hitSlop={8}>
              <T variant="caption" style={styles.link}>Terms</T>
            </Pressable>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(LEGAL.privacyUrl)} hitSlop={8}>
              <T variant="caption" style={styles.link}>Privacy</T>
            </Pressable>
          </View>
        </View>
      }>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="Close" onPress={close} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={22} color={Colors.muted} />
        </Pressable>
      </View>

      <T variant="label">Heirloom Pro</T>
      <T variant="display">Know what it's worth before you sell, donate or toss it.</T>

      <View style={{ gap: Space.md }}>
        <Bullet icon="infinite-outline">Unlimited scans with real comparable sales</Bullet>
        <Bullet icon="albums-outline">Your collection, with its total estimated value</Bullet>
        <Bullet icon="storefront-outline">Where to sell each item, typical fees and tips that get a better price</Bullet>
        <Bullet icon="search-outline">Close-up re-checks of maker's marks and labels</Bullet>
      </View>

      {source !== 'onboarding' && freeScansLeft === 0 ? (
        <T variant="caption">You've used your {FREE_SCANS} free scans.</T>
      ) : null}

      {!purchasesAvailable() ? (
        <T variant="caption">Purchases need a development or store build on iOS or Android (not Expo Go or web).</T>
      ) : packages === null ? (
        <ActivityIndicator color={Colors.ink} />
      ) : packages.length === 0 ? (
        <T variant="caption">Plans aren't available right now. Please try again later.</T>
      ) : (
        <View style={{ gap: Space.sm }}>
          {packages.map((pkg) => {
            const copy = packageCopy(pkg);
            const active = pkg.identifier === selected;
            return (
              <Pressable
                key={pkg.identifier}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setSelected(pkg.identifier)}
                style={[styles.plan, active && styles.planActive]}>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={active ? Colors.ink : Colors.muted}
                />
                <View style={{ flex: 1 }}>
                  <T variant="heading">{copy.title}</T>
                  <T variant="caption">{copy.subtitle}</T>
                </View>
                {copy.badge ? (
                  <View style={styles.badge}>
                    <T style={styles.badgeText}>{copy.badge}</T>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  planActive: { borderColor: Colors.ink },
  badge: { backgroundColor: Colors.brassTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  badgeText: { color: Colors.brassDark, fontSize: 12, fontWeight: '700' },
  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: Space.xl, paddingTop: Space.xs },
  link: { textDecorationLine: 'underline' },
});
