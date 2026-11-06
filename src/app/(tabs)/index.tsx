import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Pill, T } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
import { formatRange, formatUsd } from '@/lib/format';
import { photoExists, photoUri } from '@/lib/images';
import { subscribeItems } from '@/lib/items';
import type { Item } from '@/lib/types';

function useColumns() {
  const { width } = useWindowDimensions();
  const usable = Math.min(width, MaxContentWidth) - Space.lg * 2;
  const cols = width >= 900 ? 3 : 2;
  return { cols, tile: (usable - Space.md * (cols - 1)) / cols };
}

export default function Collection() {
  const { user, isPro } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const { cols, tile } = useColumns();

  useEffect(() => {
    if (!user) return;
    return subscribeItems(user.uid, setItems, () => setItems([]));
  }, [user]);

  const totals = useMemo(() => {
    const list = (items ?? []).filter((i) => i.appraisal.is_identifiable);
    return {
      low: list.reduce((s, i) => s + i.appraisal.value_low, 0),
      high: list.reduce((s, i) => s + i.appraisal.value_high, 0),
      count: items?.length ?? 0,
    };
  }, [items]);

  const header = (
    <View style={{ gap: Space.lg, marginBottom: Space.lg }}>
      <T variant="title">Your collection</T>
      <View style={styles.totalCard}>
        <T variant="label" style={{ color: Colors.brassTint }}>Estimated total value</T>
        {isPro ? (
          <T style={styles.totalValue}>{totals.count ? formatRange(totals.low, totals.high) : formatUsd(0)}</T>
        ) : (
          <Pressable onPress={() => router.push('/paywall')} style={styles.lockedRow} accessibilityRole="button">
            <Ionicons name="lock-closed" size={18} color="#fff" />
            <T style={[styles.totalValue, { fontSize: 22 }]}>Unlock with Pro</T>
          </Pressable>
        )}
        <T style={{ color: '#D8CDBE' }}>
          {totals.count} {totals.count === 1 ? 'item' : 'items'}
        </T>
      </View>
    </View>
  );

  if (items === null) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={Colors.ink} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        key={cols}
        data={items}
        numColumns={cols}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        columnWrapperStyle={cols > 1 ? { gap: Space.md } : undefined}
        ItemSeparatorComponent={() => <View style={{ height: Space.md }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="camera-outline" size={40} color={Colors.brassDark} />
            <T variant="heading" style={{ textAlign: 'center' }}>Scan your first item</T>
            <T style={{ textAlign: 'center' }}>
              Pick something old: a vase, a watch, a toy, a piece of art. We'll tell you what it is and what it may sell for.
            </T>
            <Button title="Scan an item" icon="camera" onPress={() => router.navigate('/scan')} />
          </View>
        }
        renderItem={({ item }) => <Tile item={item} size={tile} />}
      />
    </SafeAreaView>
  );
}

function Tile({ item, size }: { item: Item; size: number }) {
  const a = item.appraisal;
  const first = item.photos?.[0];
  const uri = first && photoExists(item.id, first) ? photoUri(item.id, first) : null;
  return (
    <Pressable
      onPress={() => router.push(`/item/${item.id}`)}
      style={({ pressed }) => [styles.tile, { width: size }, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${a.item_name}, ${formatRange(a.value_low, a.value_high)}`}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', aspectRatio: 1 }} contentFit="cover" />
      ) : (
        <View style={[styles.noPhoto, { aspectRatio: 1 }]}>
          <Ionicons name="image-outline" size={28} color={Colors.muted} />
        </View>
      )}
      <View style={styles.tileBody}>
        <T variant="heading" numberOfLines={2} style={{ fontSize: 15, lineHeight: 20 }}>
          {a.item_name}
        </T>
        <T style={{ color: Colors.ink, fontWeight: '700' }}>{formatRange(a.value_low, a.value_high)}</T>
        {a.needs_closeup ? <Pill label="Add close-up" tone="warn" icon="search" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  list: { padding: Space.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', flexGrow: 1 },
  totalCard: { backgroundColor: Colors.ink, borderRadius: Radius.lg, padding: Space.xl, gap: Space.xs },
  totalValue: { color: '#fff', fontSize: 30, lineHeight: 38, fontWeight: '700' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.xs },
  empty: { alignItems: 'center', gap: Space.md, paddingVertical: Space.xxl, paddingHorizontal: Space.lg },
  tile: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.line,
  },
  noPhoto: { width: '100%', backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tileBody: { padding: Space.md, gap: Space.xs },
});
