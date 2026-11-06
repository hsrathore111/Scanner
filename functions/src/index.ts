import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { applyEvidence, normalizeUrl, verifyComparables, type Comparable, type Evidence, type Level } from "./evidence";

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const REVENUECAT_SECRET_KEY = defineSecret("REVENUECAT_SECRET_KEY");

/** Keep FREE_SCANS and REPORT_PRODUCT_ID in sync with src/constants/config.ts in the app. */
const FREE_SCANS = 3;
const PRO_DAILY_SCANS = 25; // cost guard for subscribers
const MAX_REFINEMENTS = 2; // close-ups and corrections on one item don't use a new scan
const MAX_PHOTOS = 6;
const PRO_ENTITLEMENT = "pro";
const REPORT_PRODUCT_ID = "heirloom_item_report";
const MODEL = "claude-opus-5-5";
const REGION = "us-central1";

class UserFacingError extends Error {}

// ---------- Appraisal schema (returned through a strict tool call) ----------

const confidence = { type: "string", enum: ["low", "medium", "high"] };

const APPRAISAL_TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_appraisal",
  description:
    "Submit the final identification and US resale value estimate for the photographed item. Call this exactly once, after researching comparable sales.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "is_identifiable", "item_name", "category", "summary", "maker", "era", "materials", "condition_notes",
      "identification_confidence", "value_low", "value_high", "quick_sale_value", "replacement_value",
      "value_confidence", "value_basis", "comparables", "value_factors", "authenticity_checks",
      "lookalike_warning", "needs_closeup", "closeup_request", "recommendation", "recommendation_reason",
      "where_to_sell", "selling_tips", "listing_title", "listing_description",
    ],
    properties: {
      is_identifiable: { type: "boolean", description: "False if the photo is unusable or not an object that can be valued." },
      item_name: { type: "string", description: "Specific name, e.g. 'Fiesta Ware Turquoise Disk Pitcher'." },
      category: { type: "string", description: "Short category, e.g. 'Pottery', 'Furniture', 'Silver', 'Watches', 'Toys'." },
      summary: { type: "string", description: "2-3 sentences: what it is and why collectors care (or don't)." },
      maker: { type: "string", description: "Maker / brand / artist, or empty string if unknown." },
      era: { type: "string", description: "Approximate date or era, e.g. 'c. 1936-1950', or empty string." },
      materials: { type: "string" },
      condition_notes: { type: "string", description: "Condition visible in the photos and what you can't judge from them." },
      identification_confidence: confidence,
      value_low: { type: "number", description: "Low end of what this realistically SELLS for in the US, in USD." },
      value_high: { type: "number", description: "High end of what this realistically SELLS for in the US, in USD." },
      quick_sale_value: { type: "number", description: "What a dealer, pawn shop or fast local sale would likely pay, in USD." },
      replacement_value: { type: "number", description: "Approximate retail cost to replace it with a comparable piece, in USD. Usually above resale." },
      value_confidence: confidence,
      value_basis: { type: "string", description: "One or two sentences on how the range was derived." },
      comparables: {
        type: "array",
        description: "Comparable listings taken from web search results. Only include URLs that appeared in your search results.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "price", "status", "source", "url", "date"],
          properties: {
            title: { type: "string" },
            price: { type: "number", description: "USD" },
            status: { type: "string", enum: ["sold", "listed", "auction_result", "price_guide"] },
            source: { type: "string", description: "Site name, e.g. 'eBay', 'LiveAuctioneers'." },
            url: { type: "string" },
            date: { type: "string", description: "Sale/listing date if shown, else empty string." },
          },
        },
      },
      value_factors: { type: "array", items: { type: "string" }, description: "Things that move the value up or down." },
      authenticity_checks: {
        type: "array",
        items: { type: "string" },
        description: "Practical checks the owner can do themselves to tell the real thing from a reproduction or lesser version.",
      },
      lookalike_warning: {
        type: "string",
        description: "If this could be a much cheaper look-alike (silver plate vs sterling, reproduction vs original, later reissue), say which and how the value would change. Else empty string.",
      },
      needs_closeup: { type: "boolean", description: "True when a specific extra photo would materially change the identification or value." },
      closeup_request: { type: "string", description: "Exactly what to photograph next and why. Empty if not needed." },
      recommendation: { type: "string", enum: ["sell", "keep", "donate", "get_appraised"], description: "Most sensible next step for this owner." },
      recommendation_reason: { type: "string", description: "One sentence. Use get_appraised when value may be high and hinges on something photos can't settle." },
      where_to_sell: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["venue", "why", "fees", "fee_percent"],
          properties: {
            venue: { type: "string", description: "US venue, e.g. 'eBay', 'Etsy', 'Facebook Marketplace', 'Chairish', 'local auction house'." },
            why: { type: "string" },
            fees: { type: "string", description: "Typical seller fees in words, e.g. '~13% final value fee'." },
            fee_percent: { type: "number", description: "Typical total fee as a percent of the sale price, e.g. 13. Use 0 for fee-free local sales." },
          },
        },
      },
      selling_tips: { type: "array", items: { type: "string" } },
      listing_title: { type: "string", description: "Ready-to-paste marketplace title, at most 80 characters, with the words buyers search for." },
      listing_description: { type: "string", description: "Ready-to-paste honest listing description. State condition plainly and never claim authenticity that isn't established." },
    },
  },
};

export type Appraisal = {
  is_identifiable: boolean;
  item_name: string;
  category: string;
  summary: string;
  maker: string;
  era: string;
  materials: string;
  condition_notes: string;
  identification_confidence: Level;
  value_low: number;
  value_high: number;
  quick_sale_value: number;
  replacement_value: number;
  value_confidence: Level;
  value_basis: string;
  comparables: Comparable[];
  value_factors: string[];
  authenticity_checks: string[];
  lookalike_warning: string;
  needs_closeup: boolean;
  closeup_request: string;
  recommendation: "sell" | "keep" | "donate" | "get_appraised";
  recommendation_reason: string;
  where_to_sell: { venue: string; why: string; fees: string; fee_percent: number }[];
  selling_tips: string[];
  listing_title: string;
  listing_description: string;
  evidence?: Evidence;
};

const SYSTEM_PROMPT = `You are the appraisal engine of a US mobile app. People photograph old or secondhand items (antiques, vintage pieces, collectibles, thrift finds, heirlooms) and want to know what the item is, what it is realistically worth, and where to sell it.

The thing users hate most about apps like this is inflated values: they get excited, then the item sells for a fraction of the estimate. Being trustworthy matters more than being impressive. Someone may make a real decision about selling, donating or discarding a family piece based on your answer.

How to work:
- Identify the item as specifically as the evidence allows: maker, pattern or model, era, materials. Read any visible marks, labels, signatures or hallmarks, and rely on what the photos actually show, including what the owner tells you.
- Research the value with web search before answering. Anchor on recent SOLD prices and auction results (eBay sold listings, LiveAuctioneers, Invaluable, WorthPoint, Heritage). Asking prices are weak evidence because many listings never sell; label those "listed" and don't let them set the range.
- The value range is what this item realistically sells for in the condition shown, in USD. Match comparables closely on maker, size, pattern and condition. Don't borrow prices from the best example of a type. If comparables are thin, say so in value_basis and lower value_confidence.
- Comparables must come from your search results, with the exact URL you saw and its real price. Never invent a listing, price or URL. Return an empty list rather than guess.
- Watch for the common expensive mistakes. Silver plate (EPNS, EP, A1, Sheffield plate, Rogers) is not sterling; assume plate unless a sterling or 925 mark is visible. Reproductions, reissues, "in the style of" pieces, prints versus original paintings, and gold-filled versus solid gold all look alike in photos. When one could apply, explain it in lookalike_warning and base the range on what the evidence supports.
- If one more photo would materially change the answer (maker's mark, underside, label, signature, serial number, back of a painting), set needs_closeup and say exactly what to photograph and why it matters.
- You cannot authenticate items from photos. Give checks the owner can do themselves in authenticity_checks.
- Suggest realistic US places to sell given this item's value and type, with typical fees. If an item may be regulated to sell (ivory, tortoiseshell, firearms, some taxidermy, recalled products), say so in selling_tips.
- If the photo is unusable or not something that can be valued, set is_identifiable to false, explain in summary, and use 0 for the values.

When you're done researching, call submit_appraisal once with your result.`;

// ---------- Helpers ----------

type ImageInput = { base64: string; mediaType: "image/jpeg" };
const fail = (message: string) => new HttpsError("invalid-argument", message);
const ITEM_ID = /^[A-Za-z0-9]{10,40}$/;

function validateRequest(data: unknown): { itemId: string; images: ImageInput[]; note: string } {
  const d = (data ?? {}) as Record<string, unknown>;
  const itemId = d.itemId;
  if (typeof itemId !== "string" || !ITEM_ID.test(itemId)) throw fail("Invalid itemId.");
  const raw = Array.isArray(d.images) ? d.images : [];
  if (raw.length > 4) throw fail("Send at most 4 photos.");
  const images = raw.map((img: unknown) => {
    const b = (img as { base64?: unknown } | null)?.base64;
    if (typeof b !== "string" || b.length < 100 || b.length > 4_000_000) throw fail("Photo is missing or too large.");
    return { base64: b, mediaType: "image/jpeg" as const };
  });
  const note = typeof d.note === "string" ? d.note.trim().slice(0, 500) : "";
  return { itemId, images, note };
}

function itemIdFrom(data: unknown): string {
  const itemId = (data as { itemId?: unknown } | null)?.itemId;
  if (typeof itemId !== "string" || !ITEM_ID.test(itemId)) throw fail("Invalid itemId.");
  return itemId;
}

type Subscriber = {
  entitlements?: Record<string, { expires_date: string | null }>;
  non_subscriptions?: Record<string, unknown[]>;
};

async function getSubscriber(uid: string, secretKey: string): Promise<Subscriber | null> {
  if (!secretKey) {
    logger.warn("REVENUECAT_SECRET_KEY not set; treating every user as free.");
    return null;
  }
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      logger.error("RevenueCat lookup failed", { status: res.status });
      return null;
    }
    return ((await res.json()) as { subscriber?: Subscriber }).subscriber ?? null;
  } catch (err) {
    logger.error("RevenueCat lookup error", err);
    return null;
  }
}

function hasPro(sub: Subscriber | null): boolean {
  const ent = sub?.entitlements?.[PRO_ENTITLEMENT];
  if (!ent) return false;
  return ent.expires_date === null || new Date(ent.expires_date).getTime() > Date.now();
}

async function requestAppraisal(client: Anthropic, images: ImageInput[], note: string, previous: Appraisal | null) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
  }));
  let text = previous
    ? `You already appraised this item as "${previous.item_name}". The owner has added information. Reconsider the identification and value from scratch using all of the photos, and correct your earlier answer if it was wrong.`
    : "Identify this item and estimate its US resale value.";
  if (note) text += `\n\nThe owner says: ${note}`;
  content.push({ type: "text", text });

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  const searchUrls = new Set<string>();
  let nudged = false;

  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: "US" } },
        APPRAISAL_TOOL,
      ],
      messages,
    });

    if (response.stop_reason === "refusal") {
      logger.warn("Appraisal refused", { details: response.stop_details });
      throw new UserFacingError("We can't appraise this photo. Your scan wasn't used. Try a different item or photo.");
    }

    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") searchUrls.add(normalizeUrl(r.url));
      }
    }

    const call = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === APPRAISAL_TOOL.name,
    );
    if (call) return { appraisal: call.input as Appraisal, searchUrls };
    if (response.stop_reason === "max_tokens") throw new UserFacingError("The appraisal ran too long. Your scan wasn't used. Please try again.");

    // pause_turn: send the assistant turn back unchanged and the server resumes.
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "pause_turn") {
      if (nudged) break;
      nudged = true;
      messages.push({ role: "user", content: "Please call submit_appraisal now with your best assessment." });
    }
  }
  throw new UserFacingError("We couldn't finish this appraisal. Your scan wasn't used. Please try again.");
}

const userRefFor = (uid: string) => db.collection("users").doc(uid);

/** A failed scan never costs the user anything. */
async function settleFailure(uid: string, itemId: string, consumed: boolean, isFollowUp: boolean, message: string) {
  const userRef = userRefFor(uid);
  const batch = db.batch();
  if (consumed) {
    batch.set(userRef, { scanCount: FieldValue.increment(-1), dailyCount: FieldValue.increment(-1) }, { merge: true });
  }
  batch.set(
    userRef.collection("items").doc(itemId),
    {
      status: isFollowUp ? "done" : "failed",
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
      ...(isFollowUp ? { closeupRounds: FieldValue.increment(-1) } : {}),
    },
    { merge: true },
  );
  await batch.commit();
}

// ---------- Callable: startAppraisal (reserves a scan, stores photos, queues the job) ----------

export const startAppraisal = onCall(
  { secrets: [REVENUECAT_SECRET_KEY], timeoutSeconds: 60, memory: "512MiB", region: REGION },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Please sign in.");
    const { itemId, images, note } = validateRequest(request.data);

    const userRef = userRefFor(uid);
    const itemRef = userRef.collection("items").doc(itemId);
    const today = new Date().toISOString().slice(0, 10);
    const isPro = hasPro(await getSubscriber(uid, REVENUECAT_SECRET_KEY.value()));

    // Reserve up front (refunded on failure) so concurrent calls can't exceed the limit.
    const { isFollowUp, consumed, existing } = await db.runTransaction(async (tx) => {
      const [userSnap, itemSnap] = await Promise.all([tx.get(userRef), tx.get(itemRef)]);
      const user = userSnap.data() ?? {};

      if (itemSnap.exists) {
        const item = itemSnap.data() ?? {};
        const rounds = (item.closeupRounds as number | undefined) ?? 0;
        if (item.status === "processing") throw new HttpsError("failed-precondition", "This item is still being appraised.");
        if (rounds >= MAX_REFINEMENTS) throw new HttpsError("resource-exhausted", "This item has already been re-checked twice. Start a new scan.");
        if (!images.length && !note) throw fail("Add a photo or a note.");
        if (((item.photoPaths as string[] | undefined) ?? []).length + images.length > MAX_PHOTOS) {
          throw fail("This item already has the maximum number of photos.");
        }
        tx.update(itemRef, { closeupRounds: rounds + 1, status: "processing", error: null });
        return { isFollowUp: true, consumed: false, existing: item };
      }

      if (!images.length) throw fail("Add a photo.");
      const scanCount = (user.scanCount as number | undefined) ?? 0;
      const dailyCount = user.dailyDate === today ? ((user.dailyCount as number | undefined) ?? 0) : 0;
      if (!isPro && scanCount >= FREE_SCANS) throw new HttpsError("permission-denied", "FREE_LIMIT_REACHED");
      if (isPro && dailyCount >= PRO_DAILY_SCANS) throw new HttpsError("resource-exhausted", "Daily scan limit reached. It resets tomorrow.");
      tx.set(userRef, { scanCount: scanCount + 1, dailyCount: dailyCount + 1, dailyDate: today }, { merge: true });
      tx.set(itemRef, {
        status: "processing",
        closeupRounds: 0,
        photoPaths: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { isFollowUp: false, consumed: true, existing: null };
    });

    try {
      const bucket = getStorage().bucket();
      const previous = (existing?.photoPaths as string[] | undefined) ?? [];
      const added = await Promise.all(
        images.map(async (img, i) => {
          const path = `users/${uid}/items/${itemId}/${Date.now()}-${i}.jpg`;
          await bucket.file(path).save(Buffer.from(img.base64, "base64"), { contentType: img.mediaType });
          return path;
        }),
      );
      await itemRef.update({
        photoPaths: [...previous, ...added],
        note: note || ((existing?.note as string | undefined) ?? ""),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.collection("appraisalJobs").add({ uid, itemId, consumed, isFollowUp, createdAt: FieldValue.serverTimestamp() });
      return { itemId };
    } catch (err) {
      logger.error("Could not queue appraisal", err);
      await settleFailure(uid, itemId, consumed, isFollowUp, "We couldn't upload your photo. Please try again.");
      throw new HttpsError("unavailable", "We couldn't upload your photo. Please try again.");
    }
  },
);

// ---------- Background job: keeps running if the user leaves the app ----------

export const runAppraisal = onDocumentCreated(
  { document: "appraisalJobs/{jobId}", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB", region: REGION, retry: false },
  async (event) => {
    const job = event.data?.data() as { uid: string; itemId: string; consumed: boolean; isFollowUp: boolean } | undefined;
    if (!job) return;
    const { uid, itemId, consumed, isFollowUp } = job;
    const userRef = userRefFor(uid);
    const itemRef = userRef.collection("items").doc(itemId);

    try {
      const item = (await itemRef.get()).data();
      if (!item) return; // deleted while queued
      const bucket = getStorage().bucket();
      const images = await Promise.all(
        ((item.photoPaths as string[] | undefined) ?? []).map(async (path) => {
          const [buf] = await bucket.file(path).download();
          return { base64: buf.toString("base64"), mediaType: "image/jpeg" as const };
        }),
      );

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
      const { appraisal, searchUrls } = await requestAppraisal(
        client,
        images,
        (item.note as string | undefined) ?? "",
        (item.appraisal as Appraisal | undefined) ?? null,
      );

      const comparables = verifyComparables(appraisal.comparables, searchUrls);
      const cleaned: Appraisal = { ...appraisal, ...applyEvidence(appraisal, comparables), comparables };

      const batch = db.batch();
      batch.set(itemRef, { appraisal: cleaned, status: "done", error: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      // An unusable photo shouldn't use up one of the user's scans.
      if (consumed && !cleaned.is_identifiable) {
        batch.set(userRef, { scanCount: FieldValue.increment(-1), dailyCount: FieldValue.increment(-1) }, { merge: true });
      }
      await batch.commit();
    } catch (err) {
      let message = "Something went wrong. Your scan wasn't used. Please try again.";
      if (err instanceof UserFacingError) message = err.message;
      else if (err instanceof Anthropic.RateLimitError) message = "We're busy right now. Your scan wasn't used. Please try again in a minute.";
      else if (err instanceof Anthropic.APIError) logger.error("Anthropic API error", { status: err.status, message: err.message });
      else logger.error("Unexpected appraisal error", err);
      await settleFailure(uid, itemId, consumed, isFollowUp, message).catch((e) => logger.error("Refund failed", e));
    } finally {
      await event.data?.ref.delete().catch(() => {});
    }
  },
);

// ---------- Callable: deleteItem ----------

export const deleteItem = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in.");
  const itemId = itemIdFrom(request.data);
  await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/items/${itemId}/` });
  await userRefFor(uid).collection("items").doc(itemId).delete();
  return { ok: true };
});

// ---------- Callable: claimReport (each paid report purchase unlocks one item) ----------

export const claimReport = onCall({ secrets: [REVENUECAT_SECRET_KEY], region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in.");
  const itemId = itemIdFrom(request.data);

  const sub = await getSubscriber(uid, REVENUECAT_SECRET_KEY.value());
  const purchased = sub?.non_subscriptions?.[REPORT_PRODUCT_ID]?.length ?? 0;
  const userRef = userRefFor(uid);
  const itemRef = userRef.collection("items").doc(itemId);

  await db.runTransaction(async (tx) => {
    const [userSnap, itemSnap] = await Promise.all([tx.get(userRef), tx.get(itemRef)]);
    if (!itemSnap.exists) throw new HttpsError("not-found", "Item not found.");
    if (itemSnap.data()?.reportPurchasedAt) return;
    const claimed = (userSnap.data()?.reportsClaimed as number | undefined) ?? 0;
    if (claimed >= purchased) throw new HttpsError("permission-denied", "We couldn't confirm this purchase yet. Try again in a moment.");
    tx.set(userRef, { reportsClaimed: claimed + 1 }, { merge: true });
    tx.update(itemRef, { reportPurchasedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

// ---------- Callable: deleteAccount (App Store guideline 5.1.1(v)) ----------

export const deleteAccount = onCall({ secrets: [REVENUECAT_SECRET_KEY], timeoutSeconds: 120, region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in.");

  await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/` });
  await db.recursiveDelete(userRefFor(uid));

  const key = REVENUECAT_SECRET_KEY.value();
  if (key) {
    await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    }).catch((e) => logger.error("RevenueCat delete failed", e));
  }
  await getAuth().deleteUser(uid);
  return { ok: true };
});
