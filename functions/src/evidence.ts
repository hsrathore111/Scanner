/**
 * The honesty layer. Users' top complaint about this category is inflated values, so the model's
 * opinion never gets the last word: code checks it against the comparables we could verify.
 */
export type Level = "low" | "medium" | "high";

export type Comparable = { title: string; price: number; status: string; source: string; url: string; date: string };

export type Evidence = {
  verified_count: number;
  sold_count: number;
  listed_count: number;
  median_sold: number | null;
  /** Why confidence was lowered, shown to the user. Empty when nothing changed. */
  note: string;
};

export function normalizeUrl(u: string): string {
  return u.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
}

const REALIZED = new Set(["sold", "auction_result"]);

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Keeps only comparables whose URL really appeared in search results. */
export function verifyComparables(comparables: Comparable[], searchUrls: Set<string>, limit = 8): Comparable[] {
  const seen = new Set<string>();
  const out: Comparable[] = [];
  for (const c of comparables ?? []) {
    const key = c.url ? normalizeUrl(c.url) : "";
    if (!key || !searchUrls.has(key) || seen.has(key) || !(c.price > 0)) continue;
    seen.add(key);
    out.push(c);
  }
  // Realized prices first: they are the stronger evidence.
  out.sort((a, b) => Number(REALIZED.has(b.status)) - Number(REALIZED.has(a.status)));
  return out.slice(0, limit);
}

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const lower = (a: Level, b: Level): Level => (RANK[a] <= RANK[b] ? a : b);

/** Caps value confidence to what the verified evidence supports. It can only lower, never raise. */
export function applyEvidence(
  input: { value_low: number; value_high: number; value_confidence: Level },
  verified: Comparable[],
): { value_low: number; value_high: number; value_confidence: Level; evidence: Evidence } {
  const low = Math.max(0, Math.min(input.value_low, input.value_high));
  const high = Math.max(0, input.value_low, input.value_high);
  const sold = verified.filter((c) => REALIZED.has(c.status)).map((c) => c.price);
  let confidence = input.value_confidence;
  let note = "";

  if (sold.length === 0) {
    confidence = "low";
    note = verified.length
      ? "We found asking prices but no verified sold prices, so treat this as a rough guide."
      : "We couldn't verify any comparable sales, so treat this as a rough guide.";
  } else if (sold.length < 3) {
    confidence = lower(confidence, "medium");
    if (confidence !== input.value_confidence) {
      note = `Based on only ${sold.length} verified sold price${sold.length === 1 ? "" : "s"}.`;
    }
  }

  if (sold.length >= 3 && low > Math.max(...sold)) {
    confidence = "low";
    note = "This estimate is above every verified sold price we found, so be cautious.";
  }

  return {
    value_low: low,
    value_high: high,
    value_confidence: confidence,
    evidence: {
      verified_count: verified.length,
      sold_count: sold.length,
      listed_count: verified.length - sold.length,
      median_sold: median(sold),
      note,
    },
  };
}
