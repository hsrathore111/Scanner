import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const REVENUECAT_SECRET_KEY = defineSecret("REVENUECAT_SECRET_KEY");

/** Keep these in sync with src/constants/config.ts in the app. */
const FREE_SCANS = 3;
const PRO_DAILY_SCANS = 25; // cost guard for subscribers
const MAX_CLOSEUP_ROUNDS = 2; // follow-up close-ups on one item don't use a new scan
const PRO_ENTITLEMENT = "pro";
const MODEL = "claude-opus-5-5";

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
      "is_identifiable", "item_name", "category", "summary", "maker", "era", "materials",
      "condition_notes", "identification_confidence", "value_low", "value_high",
      "value_confidence", "value_basis", "comparables", "value_factors",
      "needs_closeup", "closeup_request", "where_to_sell", "selling_tips",
    ],
    properties: {
      is_identifiable: { type: "boolean", description: "False if the photo is unusable or not an object that can be valued." },
      item_name: { type: "string", description: "Specific name, e.g. 'Fiesta Ware Turquoise Disk Pitcher'." },
      category: { type: "string", description: "Short category, e.g. 'Pottery', 'Furniture', 'Watches', 'Toys'." },
      summary: { type: "string", description: "2-3 sentences: what it is and why collectors care (or don't)." },
      maker: { type: "string", description: "Maker / brand / artist, or empty string if unknown." },
      era: { type: "string", description: "Approximate date or era, e.g. 'c. 1936-1950', or empty string." },
      materials: { type: "string" },
      condition_notes: { type: "string", description: "Condition visible in the photos and what you can't judge from them." },
      identification_confidence: confidence,
      value_low: { type: "number", description: "Low end of a realistic US resale price in USD." },
      value_high: { type: "number", description: "High end of a realistic US resale price in USD." },
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
      value_factors: {
        type: "array",
        items: { type: "string" },
        description: "Things that would move the value up or down (marks, chips, original box, size variant...).",
      },
      needs_closeup: { type: "boolean", description: "True when a specific extra photo would materially change the identification or value." },
      closeup_request: { type: "string", description: "Exactly what to photograph next, e.g. 'the underside, showing the maker's stamp'. Empty if not needed." },
      where_to_sell: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["venue", "why", "fees"],
          properties: {
            venue: { type: "string", description: "US venue, e.g. 'eBay', 'Etsy', 'Facebook Marketplace', 'local auction house', 'Chairish'." },
            why: { type: "string" },
            fees: { type: "string", description: "Typical seller fees, e.g. '~13% final value fee'." },
          },
        },
      },
      selling_tips: { type: "array", items: { type: "string" } },
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
  identification_confidence: "low" | "medium" | "high";
  value_low: number;
  value_high: number;
  value_confidence: "low" | "medium" | "high";
  value_basis: string;
  comparables: { title: string; price: number; status: string; source: string; url: string; date: string }[];
  value_factors: string[];
  needs_closeup: boolean;
  closeup_request: string;
  where_to_sell: { venue: string; why: string; fees: string }[];
  selling_tips: string[];
};

const SYSTEM_PROMPT = `You are the appraisal engine of a US mobile app. People photograph old or secondhand items (antiques, vintage pieces, collectibles, thrift finds, heirlooms) and want to know what the item is, what it is realistically worth, and where to sell it.

How to work:
- Identify the item from the photos as specifically as the evidence allows: maker, pattern/model, era, materials. Read any visible marks, labels, signatures, or hallmarks.
- Research the value with web search before answering. Prefer recent SOLD prices and auction results (eBay sold listings, LiveAuctioneers, Invaluable, WorthPoint, Heritage, Etsy and Chairish sales) over asking prices. Asking prices are weaker evidence; label them as "listed".
- Give a realistic US resale range for this item in the condition shown, in USD, not a retail or insurance replacement value. A wide range with an honest confidence level is better than a falsely precise number. If you couldn't find good comparables, say so in value_basis and lower value_confidence.
- Comparables must come from your search results, with the exact URL you saw. Never invent a listing, price, or URL. Return an empty list rather than guess.
- If one more photo would materially change the answer (maker's mark, underside, label, signature, serial number, inside of a drawer, back of a painting), set needs_closeup and say exactly what to photograph and why it matters.
- Suggest where to sell in the US given the item's value and type (eBay, Etsy, Facebook Marketplace, Chairish, 1stDibs, specialist dealers, local auction houses, consignment), with typical fees.
- You cannot authenticate items from photos. Where fakes or reproductions are common, say what distinguishes the real thing. If an item may be regulated to sell (ivory, tortoiseshell, firearms, some taxidermy, recalled products), note it in selling_tips.
- If the photo is unusable or not something that can be valued, set is_identifiable to false, explain in summary, and use 0 for the values.

When you're done researching, call submit_appraisal once with your result.`;

// ---------- Helpers ----------

type ImageInput = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

function validateRequest(data: unknown): { itemId: string; images: ImageInput[]; note: string } {
  const d = (data ?? {}) as Record<string, unknown>;
  const itemId = d.itemId;
  if (typeof itemId !== "string" || !/^[A-Za-z0-9]{10,40}$/.test(itemId)) {
    throw new HttpsError("invalid-argument", "Invalid itemId.");
  }
  if (!Array.isArray(d.images) || d.images.length < 1 || d.images.length > 4) {
    throw new HttpsError("invalid-argument", "Send between 1 and 4 photos.");
  }
  const images = d.images.map((img: unknown) => {
    const i = (img ?? {}) as Record<string, unknown>;
    const mediaType = i.mediaType ?? "image/jpeg";
    if (typeof i.base64 !== "string" || i.base64.length < 100 || i.base64.length > 4_000_000) {
      throw new HttpsError("invalid-argument", "Photo is missing or too large.");
    }
    if (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/webp") {
      throw new HttpsError("invalid-argument", "Unsupported photo format.");
    }
    return { base64: i.base64, mediaType } as ImageInput;
  });
  const note = typeof d.note === "string" ? d.note.slice(0, 500) : "";
  return { itemId, images, note };
}

async function hasProEntitlement(uid: string, secretKey: string): Promise<boolean> {
  if (!secretKey) {
    logger.warn("REVENUECAT_SECRET_KEY not set; treating every user as free.");
    return false;
  }
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      logger.error("RevenueCat lookup failed", { status: res.status });
      return false;
    }
    const body = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date: string | null }> };
    };
    const ent = body.subscriber?.entitlements?.[PRO_ENTITLEMENT];
    if (!ent) return false;
    return ent.expires_date === null || new Date(ent.expires_date).getTime() > Date.now();
  } catch (err) {
    logger.error("RevenueCat lookup error", err);
    return false;
  }
}

function normalizeUrl(u: string): string {
  return u.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
}

/** Runs the model until it calls submit_appraisal. Returns the appraisal plus every URL web search surfaced. */
async function runAppraisal(client: Anthropic, images: ImageInput[], note: string, isFollowUp: boolean) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
  }));
  let text = isFollowUp
    ? "Here are the original photo(s) plus the close-up you asked for. Refine the identification and value."
    : "Identify this item and estimate its US resale value.";
  if (note) text += `\n\nThe owner adds: ${note}`;
  content.push({ type: "text", text });

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  const searchUrls = new Set<string>();
  let nudged = false;

  for (let turn = 0; turn < 5; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 5,
          user_location: { type: "approximate", country: "US" },
        },
        APPRAISAL_TOOL,
      ],
      messages,
    });

    if (response.stop_reason === "refusal") {
      logger.warn("Appraisal refused", { details: response.stop_details });
      throw new HttpsError("failed-precondition", "We can't appraise this photo. Try a different item or photo.");
    }

    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === "web_search_result") searchUrls.add(normalizeUrl(r.url));
        }
      }
    }

    const call = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === APPRAISAL_TOOL.name,
    );
    if (call) return { appraisal: call.input as Appraisal, searchUrls };

    if (response.stop_reason === "max_tokens") {
      throw new HttpsError("internal", "The appraisal ran too long. Please try again.");
    }

    // pause_turn: send the assistant turn back unchanged and the server resumes.
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "pause_turn") {
      if (nudged) break;
      nudged = true;
      messages.push({ role: "user", content: "Please call submit_appraisal now with your best assessment." });
    }
  }
  throw new HttpsError("internal", "We couldn't finish this appraisal. Please try again.");
}

// ---------- Callable: appraiseItem ----------

export const appraiseItem = onCall(
  {
    secrets: [ANTHROPIC_API_KEY, REVENUECAT_SECRET_KEY],
    timeoutSeconds: 300,
    memory: "512MiB",
    region: "us-central1",
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Please sign in.");
    const { itemId, images, note } = validateRequest(request.data);

    const userRef = db.collection("users").doc(uid);
    const itemRef = userRef.collection("items").doc(itemId);
    const today = new Date().toISOString().slice(0, 10);
    const isPro = await hasProEntitlement(uid, REVENUECAT_SECRET_KEY.value());

    // Reserve a scan up front (refunded on failure) so concurrent calls can't exceed the limit.
    const { isFollowUp, consumed } = await db.runTransaction(async (tx) => {
      const [userSnap, itemSnap] = await Promise.all([tx.get(userRef), tx.get(itemRef)]);
      const user = userSnap.data() ?? {};
      const rounds = (itemSnap.data()?.closeupRounds as number | undefined) ?? 0;

      if (itemSnap.exists) {
        if (rounds >= MAX_CLOSEUP_ROUNDS) {
          throw new HttpsError("resource-exhausted", "This item has already been refined twice. Start a new scan.");
        }
        tx.update(itemRef, { closeupRounds: rounds + 1 });
        return { isFollowUp: true, consumed: false };
      }

      const scanCount = (user.scanCount as number | undefined) ?? 0;
      const dailyCount = user.dailyDate === today ? ((user.dailyCount as number | undefined) ?? 0) : 0;
      if (!isPro && scanCount >= FREE_SCANS) {
        throw new HttpsError("permission-denied", "FREE_LIMIT_REACHED");
      }
      if (isPro && dailyCount >= PRO_DAILY_SCANS) {
        throw new HttpsError("resource-exhausted", "Daily scan limit reached. It resets tomorrow.");
      }
      tx.set(userRef, { scanCount: scanCount + 1, dailyCount: dailyCount + 1, dailyDate: today }, { merge: true });
      return { isFollowUp: false, consumed: true };
    });

    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
      const { appraisal, searchUrls } = await runAppraisal(client, images, note, isFollowUp);

      // Evidence check: keep only comparables whose URL actually appeared in search results.
      const comparables = (appraisal.comparables ?? [])
        .filter((c) => c.url && searchUrls.has(normalizeUrl(c.url)))
        .slice(0, 8);
      const low = Math.max(0, Math.min(appraisal.value_low, appraisal.value_high));
      const high = Math.max(appraisal.value_low, appraisal.value_high);
      const cleaned: Appraisal = { ...appraisal, comparables, value_low: low, value_high: high };

      await itemRef.set(
        {
          appraisal: cleaned,
          photoCount: images.length,
          status: "done",
          updatedAt: FieldValue.serverTimestamp(),
          ...(isFollowUp ? {} : { createdAt: FieldValue.serverTimestamp(), closeupRounds: 0 }),
        },
        { merge: true },
      );

      const userSnap = await userRef.get();
      const used = (userSnap.data()?.scanCount as number | undefined) ?? 0;
      return { itemId, appraisal: cleaned, isPro, freeScansLeft: isPro ? null : Math.max(0, FREE_SCANS - used) };
    } catch (err) {
      // Refund the reservation so a failed scan doesn't cost the user anything.
      await db.runTransaction(async (tx) => {
        if (consumed) {
          tx.set(userRef, { scanCount: FieldValue.increment(-1), dailyCount: FieldValue.increment(-1) }, { merge: true });
        } else {
          tx.update(itemRef, { closeupRounds: FieldValue.increment(-1) });
        }
      }).catch((e) => logger.error("Refund failed", e));

      if (err instanceof HttpsError) throw err;
      if (err instanceof Anthropic.RateLimitError) {
        throw new HttpsError("unavailable", "We're busy right now. Please try again in a minute.");
      }
      if (err instanceof Anthropic.APIError) {
        logger.error("Anthropic API error", { status: err.status, message: err.message });
        throw new HttpsError("unavailable", "The appraisal service is temporarily unavailable.");
      }
      logger.error("Unexpected appraisal error", err);
      throw new HttpsError("internal", "Something went wrong. Please try again.");
    }
  },
);
