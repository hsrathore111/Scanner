import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEvidence, median, normalizeUrl, verifyComparables, type Comparable } from "./evidence";

const comp = (price: number, status = "sold", url = `https://ebay.com/itm/${price}`): Comparable => ({
  title: "x",
  price,
  status,
  source: "eBay",
  url,
  date: "",
});

test("normalizeUrl ignores scheme, www, query and trailing slash", () => {
  assert.equal(normalizeUrl("https://www.eBay.com/itm/1/?a=b#c"), "ebay.com/itm/1");
});

test("median handles odd, even and empty lists", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test("verifyComparables drops invented URLs, duplicates and zero prices, realized first", () => {
  const real = new Set(["ebay.com/itm/10", "ebay.com/itm/20", "ebay.com/itm/0"]);
  const out = verifyComparables(
    [comp(20, "listed"), comp(10), comp(10), comp(0), comp(99, "sold", "https://fake.example/1")],
    real,
  );
  assert.deepEqual(out.map((c) => c.price), [10, 20]);
});

test("no sold evidence forces low confidence", () => {
  const r = applyEvidence({ value_low: 10, value_high: 20, value_confidence: "high" }, [comp(15, "listed")]);
  assert.equal(r.value_confidence, "low");
  assert.equal(r.evidence.listed_count, 1);
  assert.match(r.evidence.note, /asking prices/);
});

test("one or two sold prices cap confidence at medium", () => {
  const r = applyEvidence({ value_low: 10, value_high: 20, value_confidence: "high" }, [comp(15), comp(18)]);
  assert.equal(r.value_confidence, "medium");
  assert.equal(r.evidence.median_sold, 16.5);
});

test("an estimate above every verified sale is flagged", () => {
  const r = applyEvidence({ value_low: 500, value_high: 900, value_confidence: "high" }, [comp(40), comp(50), comp(60)]);
  assert.equal(r.value_confidence, "low");
  assert.match(r.evidence.note, /above every/);
});

test("strong evidence leaves the model's confidence alone and never raises it", () => {
  const sold = [comp(40), comp(50), comp(60)];
  assert.equal(applyEvidence({ value_low: 40, value_high: 60, value_confidence: "high" }, sold).value_confidence, "high");
  assert.equal(applyEvidence({ value_low: 40, value_high: 60, value_confidence: "medium" }, sold).value_confidence, "medium");
});

test("swapped or negative bounds are repaired", () => {
  const r = applyEvidence({ value_low: 90, value_high: -10, value_confidence: "low" }, []);
  assert.equal(r.value_low, 0);
  assert.equal(r.value_high, 90);
});
