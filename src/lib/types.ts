import type { Timestamp } from 'firebase/firestore';

export type Confidence = 'low' | 'medium' | 'high';

export type Comparable = {
  title: string;
  price: number;
  status: 'sold' | 'listed' | 'auction_result' | 'price_guide' | string;
  source: string;
  url: string;
  date: string;
};

export type Evidence = {
  verified_count: number;
  sold_count: number;
  listed_count: number;
  median_sold: number | null;
  note: string;
};

export type Recommendation = 'sell' | 'keep' | 'donate' | 'get_appraised';

/** Mirrors the Appraisal type in functions/src/index.ts. */
export type Appraisal = {
  is_identifiable: boolean;
  item_name: string;
  category: string;
  summary: string;
  maker: string;
  era: string;
  materials: string;
  condition_notes: string;
  identification_confidence: Confidence;
  value_low: number;
  value_high: number;
  quick_sale_value: number;
  replacement_value: number;
  value_confidence: Confidence;
  value_basis: string;
  comparables: Comparable[];
  value_factors: string[];
  authenticity_checks: string[];
  lookalike_warning: string;
  needs_closeup: boolean;
  closeup_request: string;
  recommendation: Recommendation;
  recommendation_reason: string;
  where_to_sell: { venue: string; why: string; fees: string; fee_percent: number }[];
  selling_tips: string[];
  listing_title: string;
  listing_description: string;
  evidence?: Evidence;
};

export type Item = {
  id: string;
  status: 'processing' | 'done' | 'failed';
  error?: string | null;
  /** Missing until the first appraisal finishes. */
  appraisal?: Appraisal;
  photoPaths?: string[];
  note?: string;
  closeupRounds?: number;
  reportPurchasedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
