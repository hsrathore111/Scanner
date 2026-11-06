import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { PurchasesStoreProduct } from 'react-native-purchases';

import { Bullet, Button, Card, Pill, Screen, SectionTitle, T } from '@/components/ui';
import { Colors, Radius, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
import { comparableStatusLabel, confidenceLabel, ebaySoldSearchUrl, formatRange, formatUsd } from '@/lib/format';
import { persistPhotos, photoBase64, photoExists, photoUri, pickPhoto, preparePhoto, type PreparedPhoto } from '@/lib/images';
import { appraise, deleteItem, describeAppraiseError, markReportPurchased, setItemPhotos, subscribeItem } from '@/lib/items';
import { buyProduct, getReportProduct, purchasesAvailable } from '@/lib/purchases';
import { createAndShareReport } from '@/lib/report';
import type { Confidence, Item } from '@/lib/types';

const toneFor = (c: Confidence): 'good' | 'brass' | 'warn' => (c === 'high' ? 'good' : c === 'medium' ? 'brass' : 'warn');

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isPro } = useApp();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [reportProduct, setReportProduct] = useState<PurchasesStoreProduct | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    return subscribeItem(user.uid, id, setItem);
  }, [user, id]);

  useEffect(() => {
    getReportProduct().then(setReportProduct).catch(() => {});
  }, []);

  if (item === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.ink} />
      </View>
    );
  }
  if (item === null || !item.appraisal) {
    return (
      <Screen edges={[]}>
        <T variant="heading">This item is no longer in your collection.</T>
        <Button title="Back to collection" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const a = item.appraisal;
  const photos = (item.photos ?? []).filter((n) => photoExists(item.id, n));
  const roundsLeft = 2 - (item.closeupRounds ?? 0);

  const addCloseup = async () => {
    if (!user) return;
    setRefineError(null);
    try {
      const asset = await pickPhoto('camera').catch(async (e) => {
        if ((e as Error).message === 'CAMERA_PERMISSION_DENIED') return pickPhoto('library');
        throw e;
      });
      if (!asset) return;
      setRefining(true);
      const closeup = await preparePhoto(asset);
      const previous: PreparedPhoto[] = [];
      for (const name of photos.slice(0, 3)) {
        const b64 = await photoBase64(item.id, name);
        if (b64) previous.push({ uri: photoUri(item.id, name), base64: b64, mediaType: 'image/jpeg' });
      }
      await appraise(item.id, [...previous, closeup], item.note);
      const [name] = await persistPhotos(item.id, [closeup], photos.length);
      await setItemPhotos(user.uid, item.id, [...photos, name]);
    } catch (e) {
      setRefineError(describeAppraiseError(e).message);
    } finally {
      setRefining(false);
    }
  };

  const onReport = async () => {
    if (!user) return;
    setReportError(null);
    setReportBusy(true);
    try {
      if (!item.reportPurchasedAt) {
        if (reportProduct) {
          const res = await buyProduct(reportProduct);
          if (!res.ok) {
            if (!res.cancelled) setReportError(res.message);
            return;
          }
        } else if (!__DEV__) {
          setReportError("Reports aren't available right now. Please try again later.");
          return;
        }
        await markReportPurchased(user.uid, item.id);
      }
      await createAndShareReport(item);
    } catch (e) {
      setReportError((e as Error)?.message ?? 'Could not create the report.');
    } finally {
      setReportBusy(false);
    }
  };

  const onDelete = async () => {
    if (!user) return;
    await deleteItem(user.uid, item.id);
    router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: a.category || 'Item' }} />

      {photos.length === 1 ? (
        <Image source={{ uri: photoUri(item.id, photos[0]) }} style={[styles.photo, { width: '100%' }]} contentFit="cover" />
      ) : photos.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.sm }}>
          {photos.map((n) => (
            <Image key={n} source={{ uri: photoUri(item.id, n) }} style={styles.photo} contentFit="cover" />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: Space.sm }}>
        <T variant="title">{a.item_name}</T>
        <View style={styles.pills}>
          {a.maker ? <Pill label={a.maker} /> : null}
          {a.era ? <Pill label={a.era} /> : null}
          <Pill label={`ID: ${confidenceLabel[a.identification_confidence].toLowerCase()}`} tone={toneFor(a.identification_confidence)} />
        </View>
      </View>

      {/* Value */}
      <Card style={{ backgroundColor: Colors.ink, borderColor: Colors.ink }}>
        <T variant="label" style={{ color: Colors.brassTint }}>Estimated resale value</T>
        <T style={styles.value}>{formatRange(a.value_low, a.value_high)}</T>
        <View style={styles.pills}>
          <Pill label={confidenceLabel[a.value_confidence]} tone={toneFor(a.value_confidence)} icon="analytics-outline" />
          <Pill label={`${a.comparables.length} comparable${a.comparables.length === 1 ? '' : 's'}`} icon="pricetags-outline" />
        </View>
        <T style={{ color: '#D8CDBE' }}>{a.value_basis}</T>
      </Card>

      {/* Better scans: close-up request */}
      {a.needs_closeup && a.closeup_request && roundsLeft > 0 ? (
        <Card style={{ backgroundColor: Colors.warningTint, borderColor: Colors.warningTint }}>
          <View style={styles.inline}>
            <Ionicons name="search" size={20} color={Colors.warning} />
            <T variant="heading" style={{ flex: 1 }}>A close-up could sharpen this estimate</T>
          </View>
          <T style={{ color: Colors.ink }}>{a.closeup_request}</T>
          <Button title={refining ? 'Re-checking…' : 'Add close-up photo'} icon="camera" onPress={addCloseup} loading={refining} />
          <T variant="caption">Free re-check, doesn't use a scan.</T>
          {refineError ? <T style={{ color: Colors.danger }}>{refineError}</T> : null}
        </Card>
      ) : null}

      <T>{a.summary}</T>

      {/* Evidence */}
      <View style={{ gap: Space.sm }}>
        <SectionTitle>Comparable sales</SectionTitle>
        {a.comparables.length ? (
          a.comparables.map((c, i) => (
            <Pressable key={`${c.url}-${i}`} onPress={() => WebBrowser.openBrowserAsync(c.url)} style={styles.comp} accessibilityRole="link">
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ color: Colors.ink }} numberOfLines={2}>{c.title}</T>
                <T variant="caption">
                  {[comparableStatusLabel[c.status] ?? c.status, c.source, c.date].filter(Boolean).join(' · ')}
                </T>
              </View>
              <T variant="heading">{formatUsd(c.price)}</T>
              <Ionicons name="open-outline" size={16} color={Colors.muted} />
            </Pressable>
          ))
        ) : (
          <T variant="caption">We couldn't find close comparable sales for this item, so treat the range as a rough guide.</T>
        )}
        <Button
          title="See sold prices on eBay"
          icon="open-outline"
          variant="secondary"
          onPress={() => WebBrowser.openBrowserAsync(ebaySoldSearchUrl(a.item_name))}
        />
      </View>

      <Card>
        <SectionTitle>Details</SectionTitle>
        {([
          ['Materials', a.materials],
          ['Condition', a.condition_notes],
        ] as const).map(([k, v]) =>
          v ? (
            <View key={k} style={{ gap: 2 }}>
              <T variant="caption">{k}</T>
              <T style={{ color: Colors.ink }}>{v}</T>
            </View>
          ) : null,
        )}
        {a.value_factors.length ? (
          <View style={{ gap: Space.xs }}>
            <T variant="caption">What changes the value</T>
            {a.value_factors.map((f, i) => <Bullet key={i}>{f}</Bullet>)}
          </View>
        ) : null}
      </Card>

      {/* Selling guidance (Pro) */}
      <Card>
        <SectionTitle right={!isPro ? <Pill label="Pro" tone="brass" icon="lock-closed" /> : null}>Where to sell</SectionTitle>
        {isPro ? (
          <>
            {a.where_to_sell.map((w, i) => (
              <View key={i} style={styles.venue}>
                <View style={styles.inline}>
                  <Ionicons name="storefront-outline" size={18} color={Colors.brassDark} />
                  <T variant="heading" style={{ flex: 1, fontSize: 16 }}>{w.venue}</T>
                </View>
                <T>{w.why}</T>
                {w.fees ? <T variant="caption">Fees: {w.fees}</T> : null}
              </View>
            ))}
            {a.selling_tips.length ? (
              <View style={{ gap: Space.xs }}>
                <T variant="caption">Tips for a better price</T>
                {a.selling_tips.map((t, i) => <Bullet key={i} icon="checkmark-circle-outline" color={Colors.success}>{t}</Bullet>)}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <T>
              See the {a.where_to_sell.length || 'best'} best places to sell this item, typical fees, and{' '}
              {a.selling_tips.length || 'several'} tips for getting a better price.
            </T>
            <Button title="Unlock selling guidance" icon="star" onPress={() => router.push('/paywall')} />
          </>
        )}
      </Card>

      {/* One-time IAP: PDF report */}
      <Card>
        <SectionTitle>Insurance &amp; estate record</SectionTitle>
        <T>
          A PDF with photos, description, value range and comparable sales, ready to file with insurance or estate
          paperwork.
        </T>
        <Button
          title={
            item.reportPurchasedAt
              ? 'Share PDF report'
              : reportProduct
                ? `Get PDF report · ${reportProduct.priceString}`
                : purchasesAvailable()
                  ? 'Get PDF report'
                  : 'Create PDF report (dev)'
          }
          icon="document-text-outline"
          variant="secondary"
          onPress={onReport}
          loading={reportBusy}
        />
        {reportError ? <T style={{ color: Colors.danger }}>{reportError}</T> : null}
      </Card>

      <T variant="caption">
        Automated estimate based on your photos and public sales data. It isn't a certified appraisal and doesn't authenticate
        the item.
      </T>

      {confirmDelete ? (
        <Card style={{ backgroundColor: Colors.dangerTint, borderColor: Colors.dangerTint }}>
          <T style={{ color: Colors.ink }}>Delete this item and its photos? This can't be undone.</T>
          <View style={styles.inline}>
            <Button title="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
            <Button title="Delete" onPress={onDelete} style={{ flex: 1, backgroundColor: Colors.danger }} />
          </View>
        </Card>
      ) : (
        <Button title="Delete item" variant="ghost" icon="trash-outline" onPress={() => setConfirmDelete(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  photo: { width: 260, aspectRatio: 1, borderRadius: Radius.lg, backgroundColor: Colors.surfaceAlt },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  value: { color: '#fff', fontSize: 34, lineHeight: 42, fontWeight: '700' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  comp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.line,
  },
  venue: { gap: Space.xs, paddingBottom: Space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
});
