import type { Confidence, Recommendation } from './types';

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatUsd(n: number): string {
  return usd0.format(Math.round(n));
}

export function formatRange(low: number, high: number): string {
  if (low <= 0 && high <= 0) return 'No resale value';
  if (Math.round(low) === Math.round(high)) return formatUsd(low);
  return `${formatUsd(low)} – ${formatUsd(high)}`;
}

export const confidenceLabel: Record<Confidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

export function ebaySoldSearchUrl(query: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}

export const comparableStatusLabel: Record<string, string> = {
  sold: 'Sold',
  listed: 'Listed',
  auction_result: 'Auction',
  price_guide: 'Guide',
};

export const recommendationLabel: Record<Recommendation, string> = {
  sell: 'Worth selling',
  keep: 'Worth keeping',
  donate: 'Better to donate',
  get_appraised: 'See a professional appraiser',
};

/** What the seller keeps from the typical sale price after marketplace fees. */
export function netAfterFees(low: number, high: number, feePercent: number): number {
  const fee = Math.min(100, Math.max(0, feePercent));
  return ((low + high) / 2) * (1 - fee / 100);
}
