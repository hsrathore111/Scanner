import type { Confidence } from './types';

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
