import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from './firebase';
import type { PreparedPhoto } from './images';
import type { Item } from './types';

const itemsCol = (uid: string) => collection(db, 'users', uid, 'items');

/** Firestore-style id generated on the client, so retries can't create duplicate items. */
export function newItemId(uid: string): string {
  return doc(itemsCol(uid)).id;
}

const startCallable = httpsCallable<{ itemId: string; images: { base64: string }[]; note?: string }, { itemId: string }>(
  functions,
  'startAppraisal',
  { timeout: 90_000 },
);
const deleteCallable = httpsCallable<{ itemId: string }, { ok: boolean }>(functions, 'deleteItem');
const claimCallable = httpsCallable<{ itemId: string }, { ok: boolean }>(functions, 'claimReport');

/**
 * Uploads photos and queues the appraisal, then returns. The appraisal runs on the server and
 * lands on the item document, so it finishes even if the user leaves the app.
 * For an existing item, send only the new photos and/or a note.
 */
export async function startAppraisal(itemId: string, photos: PreparedPhoto[], note?: string) {
  await startCallable({ itemId, images: photos.map((p) => ({ base64: p.base64 })), note });
}

export function subscribeItems(uid: string, cb: (items: Item[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(itemsCol(uid), orderBy('createdAt', 'desc')),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }))),
    onError,
  );
}

export function subscribeItem(uid: string, id: string, cb: (item: Item | null) => void) {
  return onSnapshot(doc(itemsCol(uid), id), (snap) =>
    cb(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Item, 'id'>) } : null),
  );
}

export async function deleteItem(id: string) {
  await deleteCallable({ itemId: id });
}

/** Records a verified report purchase against this item. The server checks it with RevenueCat. */
export async function claimReport(id: string) {
  await claimCallable({ itemId: id });
}

/** Turns callable errors into something we can show the user. */
export function describeError(err: unknown): { message: string; limitReached: boolean } {
  const e = err as { code?: string; message?: string };
  if (e?.message === 'FREE_LIMIT_REACHED') return { message: "You've used your free scans.", limitReached: true };
  if (e?.code === 'functions/deadline-exceeded') {
    return { message: 'This took too long. Check your connection and try again.', limitReached: false };
  }
  if (e?.code === 'functions/internal' || e?.code === 'functions/unavailable') {
    return { message: "We couldn't reach the server. Check your connection and try again.", limitReached: false };
  }
  return { message: e?.message || 'Something went wrong. Please try again.', limitReached: false };
}
