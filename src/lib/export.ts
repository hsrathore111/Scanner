import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Item } from './types';

const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** One row per appraised item, for estates, insurance and resellers. */
export function collectionCsv(items: Item[]): string {
  const header = [
    'Item', 'Category', 'Maker', 'Era', 'Value low (USD)', 'Value high (USD)',
    'Quick sale (USD)', 'Replacement (USD)', 'Confidence', 'Verified sold prices',
  ];
  const rows = items.flatMap((i) => {
    const a = i.appraisal;
    if (!a?.is_identifiable) return [];
    return [[
      a.item_name, a.category, a.maker, a.era, a.value_low, a.value_high,
      a.quick_sale_value, a.replacement_value, a.value_confidence, a.evidence?.sold_count ?? 0,
    ]];
  });
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

export async function exportCollectionCsv(items: Item[]) {
  const file = new File(Paths.cache, 'heirloom-collection.csv');
  if (file.exists) file.delete();
  file.create();
  file.write(collectionCsv(items));
  await Sharing.shareAsync(file.uri, {
    UTI: 'public.comma-separated-values-text',
    mimeType: 'text/csv',
    dialogTitle: 'Your collection',
  });
}
