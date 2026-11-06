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
  value_confidence: Confidence;
  value_basis: string;
  comparables: Comparable[];
  value_factors: string[];
  needs_closeup: boolean;
  closeup_request: string;
  where_to_sell: { venue: string; why: string; fees: string }[];
  selling_tips: string[];
};

export type Item = {
  id: string;
  appraisal: Appraisal;
  /** File names under <documents>/items/<id>/ on this device. */
  photos?: string[];
  note?: string;
  closeupRounds?: number;
  reportPurchasedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type AppraiseResponse = {
  itemId: string;
  appraisal: Appraisal;
  isPro: boolean;
  freeScansLeft: number | null;
};
