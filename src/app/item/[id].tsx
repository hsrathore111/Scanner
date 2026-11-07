import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import type { PurchasesStoreProduct } from 'react-native-purchases';

import { Bullet, Button, Card, Pill, Screen, SectionTitle, T } from '@/components/ui';
import { Colors, Radius, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
import {
  comparableStatusLabel,
  confidenceLabel,
  ebaySoldSearchUrl,
  formatRange,
  formatUsd,
  netAfterFees,
  recommendationLabel,
} from '@/lib/format';
import { pickPhoto, preparePhoto, usePhotoUrl } from '@/lib/images';
import { claimReport, deleteItem, describeError, startAppraisal, subscribeItem } from '@/lib/items';
import { buyProduct, getReportProduct, purchasesAvailable } from '@/lib/purchases';
import { createAndShareReport } from '@/lib/report';
import type { Appraisal, Confidence, Item } from '@/lib/types';

const MAX_REFINEMENTS = 2;
const REVIEW_KEY = 'heirloom.review-count.v1';

const STATUS = [
  'Looking closely at your photos…',
  'Reading marks and labels…',
  'Searching recent sold prices…',
  'Checking auction results…',
  'Comparing against what actually sold…',
  'Working out a fair price range…',
];

const toneFor = (c: Confidence): 'good' | 'brass' | 'warn' => (c === 'high' ? 'good' : c === 'medium' ? 'brass' : 'warn');

/** Ask for a rating after a user's second successful appraisal, the moment they've seen real value. */
async function maybeAskForReview() {
  try {
    const n = Number((await AsyncStorage.getItem(REVIEW_KEY)) ?? 0) + 1;
    await AsyncStorage.setItem(REVIEW_KEY, String(n));
    if (n === 2 && (await StoreReview.isAvailableAsync())) await StoreReview.requestReview();
  } catch {}
}

function Photo({ path, single }: { path: string; single: boolean }) {
  const uri = usePhotoUrl(path);
  return <Image source={uri ? { uri } : null} style={[styles.photo, single && { width: '100%' }]} contentFit="cover" transition={150} />;
}

function Photos({ paths }: { paths: string[] }) {
  if (!paths.length) return null;
  if (paths.length === 1) return <Photo path={paths[0]} single />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.sm }}>
      {paths.map((p) => <Photo key={p} path={p} single={false} />)}
    </ScrollView>
  );
}

function Processing({ item }: { item: Item }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => Math.min(i + 1, STATUS.length - 1)), 7000);
    return () => clearInterval(t);
  }, []);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Appraising' }} />
      <Photos paths={item.photoPaths ?? []} />
      <Card style={{ alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.ink} />
        <T variant="heading" style={{ textAlign: 'center' }}>{STATUS[idx]}</T>
        <T variant="caption" style={{ textAlign: 'center' }}>
          Usually 30–90 seconds. You can leave this screen or the app. We'll keep working and the result will be in your collection.
        </T>
      </Card>
    </Screen>
  );
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const lastStatus = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!user || !id) return;
    return subscribeItem(user.uid, id, setItem);
  }, [user, id]);

  useEffect(() => {
    if (lastStatus.current === 'processing' && item?.status === 'done' && !item.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (item.appraisal?.is_identifiable) maybeAskForReview();
    }
    lastStatus.current = item?.status;
  }, [item]);

  if (item === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.ink} />
      </View>
    );
  }
  if (item === null) {
    return (
      <Screen edges={[]}>
        <T variant="heading">This item is no longer in your collection.</T>
        <Button title="Back to collection" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  if (item.status === 'processing') return <Processing item={item} />;
  if (!item.appraisal) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: 'Scan failed' }} />
        <T variant="heading">{item.error ?? 'Something went wrong. Your scan was not used.'}</T>
        <Button
          title="Back to Scan"
          onPress={() => {
            deleteItem(item.id).catch(() => {});
            router.replace('/scan');
          }}
        />
      </Screen>
    );
  }
  return <Result item={item} appraisal={item.appraisal} />;
}

function Evidence({ a }: { a: Appraisal }) {
  const e = a.evidence;
  if (!e) return null;
  return (
    <T style={{ color: '#D8CDBE' }}>
      {e.sold_count
        ? `Based on ${e.sold_count} verified sold price${e.sold_count === 1 ? '' : 's'}${e.median_sold ? `, median ${formatUsd(e.median_sold)}` : ''}.`
        : 'No verified sold prices.'}
      {e.note ? ` ${e.note}` : ''}
    </T>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ gap: Space.xs }}>
      <T variant="caption">{label}</T>
      <T selectable style={{ color: Colors.ink }}>{value}</T>
      <Button
        title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
        icon={copied ? 'checkmark' : 'copy-outline'}
        variant="secondary"
        onPress={async () => {
          await Clipboard.setStringAsync(value);
          setCopied(true);
        }}
      />
    </View>
  );
}

function Result({ item, appraisal: a }: { item: Item; appraisal: Appraisal }) {
  const { isPro } = useApp();
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState('');
  const [reportProduct, setReportProduct] = useState<PurchasesStoreProduct | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getReportProduct().then(setReportProduct).catch(() => {});
  }, []);

  const refinementsLeft = MAX_REFINEMENTS - (item.closeupRounds ?? 0);

  const addCloseup = async () => {
    setRefineError(null);
    try {
      const asset = await pickPhoto('camera').catch((e) => {
        if ((e as Error).message === 'CAMERA_PERMISSION_DENIED') return pickPhoto('library');
        throw e;
      });
      if (!asset) return;
      setRefining(true);
      await startAppraisal(item.id, [await preparePhoto(asset)]);
    } catch (e) {
      setRefineError(describeError(e).message);
    } finally {
      setRefining(false);
    }
  };

  const sendCorrection = async () => {
    const text = correction.trim();
    if (!text) return;
    setRefineError(null);
    setRefining(true);
    try {
      await startAppraisal(item.id, [], text);
      setCorrecting(false);
      setCorrection('');
    } catch (e) {
      setRefineError(describeError(e).message);
    } finally {
      setRefining(false);
    }
  };

  const onReport = async () => {
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
          await claimReport(item.id);
        } else if (!__DEV__) {
          setReportError("Reports aren't available right now. Please try again later.");
          return;
        }
      }
      await createAndShareReport(item, a);
    } catch (e) {
      setReportError((e as Error)?.message ?? 'Could not create the report.');
    } finally {
      setReportBusy(false);
    }
  };

  const onDelete = async () => {
    await deleteItem(item.id);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const canRefine = refinementsLeft > 0;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          title: a.category || 'Item',
          headerRight: () => (
            <Pressable
              accessibilityLabel="Share"
              hitSlop={10}
              onPress={() => Share.share({ message: `${a.item_name}: estimated ${formatRange(a.value_low, a.value_high)}, appraised with Heirloom` })}>
              <Ionicons name="share-outline" size={22} color={Colors.ink} />
            </Pressable>
          ),
        }}
      />

      <Photos paths={item.photoPaths ?? []} />

      <View style={{ gap: Space.sm }}>
        <T variant="title">{a.item_name}</T>
        <View style={styles.pills}>
          {a.maker ? <Pill label={a.maker} /> : null}
          {a.era ? <Pill label={a.era} /> : null}
          <Pill label={`ID: ${confidenceLabel[a.identification_confidence].toLowerCase()}`} tone={toneFor(a.identification_confidence)} />
        </View>
      </View>

      {item.error ? (
        <Card style={{ backgroundColor: Colors.dangerTint, borderColor: Colors.dangerTint }}>
          <T style={{ color: Colors.danger }}>{item.error}</T>
        </Card>
      ) : null}

      {a.is_identifiable ? (
        <>
          <Card style={{ backgroundColor: Colors.ink, borderColor: Colors.ink }}>
            <T variant="label" style={{ color: Colors.brassTint }}>Likely to sell for</T>
            <T style={styles.value}>{formatRange(a.value_low, a.value_high)}</T>
            <View style={styles.pills}>
              <Pill label={confidenceLabel[a.value_confidence]} tone={toneFor(a.value_confidence)} icon="analytics-outline" />
            </View>
            <Evidence a={a} />
            <View style={styles.tiers}>
              <View style={{ flex: 1 }}>
                <T variant="caption" style={{ color: '#B8AD9E' }}>Quick sale</T>
                <T style={styles.tier}>{formatUsd(a.quick_sale_value)}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="caption" style={{ color: '#B8AD9E' }}>Cost to replace</T>
                <T style={styles.tier}>{formatUsd(a.replacement_value)}</T>
              </View>
            </View>
            <T style={{ color: '#D8CDBE' }}>{a.value_basis}</T>
          </Card>

          {a.lookalike_warning ? (
            <Card style={{ backgroundColor: Colors.warningTint, borderColor: Colors.warningTint }}>
              <View style={styles.inline}>
                <Ionicons name="warning-outline" size={20} color={Colors.warning} />
                <T variant="heading" style={{ flex: 1 }}>Check this before you trust the price</T>
              </View>
              <T style={{ color: Colors.ink }}>{a.lookalike_warning}</T>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Our advice</SectionTitle>
            <T variant="heading">{recommendationLabel[a.recommendation]}</T>
            <T>{a.recommendation_reason}</T>
          </Card>
        </>
      ) : null}

      {a.needs_closeup && a.closeup_request && canRefine ? (
        <Card style={{ backgroundColor: Colors.brassTint, borderColor: Colors.brassTint }}>
          <View style={styles.inline}>
            <Ionicons name="search" size={20} color={Colors.brassDark} />
            <T variant="heading" style={{ flex: 1 }}>A close-up could sharpen this</T>
          </View>
          <T style={{ color: Colors.ink }}>{a.closeup_request}</T>
          <Button title="Add close-up photo" icon="camera" onPress={addCloseup} loading={refining} />
          <T variant="caption">Free re-check, doesn't use a scan.</T>
        </Card>
      ) : null}

      <T>{a.summary}</T>

      {a.is_identifiable ? (
        <View style={{ gap: Space.sm }}>
          <SectionTitle>Comparable sales</SectionTitle>
          {a.comparables.length ? (
            a.comparables.map((c, i) => (
              <Pressable key={`${c.url}-${i}`} onPress={() => WebBrowser.openBrowserAsync(c.url)} style={styles.comp} accessibilityRole="link">
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ color: Colors.ink }} numberOfLines={2}>{c.title}</T>
                  <T variant="caption">{[comparableStatusLabel[c.status] ?? c.status, c.source, c.date].filter(Boolean).join(' · ')}</T>
                </View>
                <T variant="heading">{formatUsd(c.price)}</T>
                <Ionicons name="open-outline" size={16} color={Colors.muted} />
              </Pressable>
            ))
          ) : (
            <T variant="caption">We couldn't verify close comparable sales for this item.</T>
          )}
          <Button
            title="Check sold prices on eBay yourself"
            icon="open-outline"
            variant="secondary"
            onPress={() => WebBrowser.openBrowserAsync(ebaySoldSearchUrl(a.item_name))}
          />
        </View>
      ) : null}

      <Card>
        <SectionTitle>Details</SectionTitle>
        {(
          [
            ['Materials', a.materials],
            ['Condition', a.condition_notes],
          ] as const
        ).map(([k, v]) =>
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
        {a.authenticity_checks.length ? (
          <View style={{ gap: Space.xs }}>
            <T variant="caption">Check it yourself</T>
            {a.authenticity_checks.map((f, i) => <Bullet key={i} icon="shield-checkmark-outline" color={Colors.success}>{f}</Bullet>)}
          </View>
        ) : null}
      </Card>

      {canRefine ? (
        correcting ? (
          <Card>
            <T variant="heading">What did we get wrong?</T>
            <TextInput
              value={correction}
              onChangeText={setCorrection}
              placeholder="e.g. 'It's stamped Gorham, not Rogers', 'it's 14 inches tall'"
              placeholderTextColor={Colors.muted}
              multiline
              maxLength={500}
              style={styles.input}
            />
            <Button title="Re-check with this" onPress={sendCorrection} loading={refining} disabled={!correction.trim()} />
            <Button title="Cancel" variant="ghost" onPress={() => setCorrecting(false)} />
          </Card>
        ) : (
          <Button title="Something's wrong? Correct this" icon="create-outline" variant="ghost" onPress={() => setCorrecting(true)} />
        )
      ) : null}
      {refineError ? <T style={{ color: Colors.danger }}>{refineError}</T> : null}

      {a.is_identifiable ? (
        <>
          <Card>
            <SectionTitle right={!isPro ? <Pill label="Pro" tone="brass" icon="lock-closed" /> : null}>Where to sell</SectionTitle>
            {isPro ? (
              <>
                {a.where_to_sell.map((w, i) => (
                  <View key={i} style={styles.venue}>
                    <View style={styles.inline}>
                      <Ionicons name="storefront-outline" size={18} color={Colors.brassDark} />
                      <T variant="heading" style={{ flex: 1, fontSize: 16 }}>{w.venue}</T>
                      <T style={{ color: Colors.ink, fontWeight: '700' }}>
                        ~{formatUsd(netAfterFees(a.value_low, a.value_high, w.fee_percent))} to you
                      </T>
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
                {a.listing_title ? <CopyField label="Listing title" value={a.listing_title} /> : null}
                {a.listing_description ? <CopyField label="Listing description" value={a.listing_description} /> : null}
              </>
            ) : (
              <>
                <T>
                  See the best places to sell this item, what you'd keep after fees, and a ready-to-paste listing title and
                  description.
                </T>
                <Button title="Unlock selling guidance" icon="star" onPress={() => router.push('/paywall')} />
              </>
            )}
          </Card>

          <Card>
            <SectionTitle>Insurance &amp; estate record</SectionTitle>
            <T>A PDF with photos, description, value range and comparable sales, ready to keep with your records.</T>
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
        </>
      ) : null}

      <T variant="caption">
        Automated estimate based on your photos and public sales data. It isn't a certified appraisal and doesn't authenticate the item.
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
  tiers: { flexDirection: 'row', gap: Space.lg, paddingVertical: Space.xs },
  tier: { color: '#fff', fontSize: 18, fontWeight: '700' },
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
  input: {
    minHeight: 72,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Space.md,
    fontSize: 15,
    color: Colors.ink,
    textAlignVertical: 'top',
  },
});
