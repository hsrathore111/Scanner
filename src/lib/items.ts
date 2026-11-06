import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from './firebase';
import { deleteItemPhotos, type PreparedPhoto } from './images';
import type { AppraiseResponse, Item } from './types';

const itemsCol = (uid: string) => collection(db, 'users', uid, 'items');

/** Firestore-style id generated on the client so photos can be saved under it before the server responds. */
export function newItemId(uid: string): string {
  return doc(itemsCol(uid)).id;
}

const appraiseCallable = httpsCallable<
  { itemId: string; images: { base64: string; mediaType: string }[]; note?: string },
  AppraiseResponse
>(functions, 'appraiseItem', { timeout: 300_000 });

export async function appraise(itemId: string, photos: PreparedPhoto[], note?: string): Promise<AppraiseResponse> {
  const res = await appraiseCallable({
    itemId,
    images: photos.map((p) => ({ base64: p.base64, mediaType: p.mediaType })),
    note,
  });
  return res.data;
}

export function subscribeItems(uid: string, cb: (items: Item[]) => void, onError?: (e: Error) => void) {
  const q = query(itemsCol(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.filter((d) => d.data().appraisal).map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }))),
    onError,
  );
}

export function subscribeItem(uid: string, id: string, cb: (item: Item | null) => void) {
  return onSnapshot(doc(itemsCol(uid), id), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Item, 'id'>) }) : null),
  );
}

export function setItemPhotos(uid: string, id: string, photos: string[]) {
  return updateDoc(doc(itemsCol(uid), id), { photos });
}

export function markReportPurchased(uid: string, id: string) {
  return updateDoc(doc(itemsCol(uid), id), { reportPurchasedAt: serverTimestamp() });
}

export async function deleteItem(uid: string, id: string) {
  await deleteDoc(doc(itemsCol(uid), id));
  deleteItemPhotos(id);
}

/** Turns callable errors into something we can show the user. */
export function describeAppraiseError(err: unknown): { message: string; limitReached: boolean } {
  const e = err as { code?: string; message?: string };
  if (e?.message === 'FREE_LIMIT_REACHED' || e?.code === 'functions/permission-denied') {
    return { message: "You've used your free scans.", limitReached: true };
  }
  if (e?.code === 'functions/deadline-exceeded') {
    return { message: 'This took too long. Check your connection and try again.', limitReached: false };
  }
  if (e?.code === 'functions/unavailable' && !e.message) {
    return { message: "You're offline. Connect to the internet and try again.", limitReached: false };
  }
  return { message: e?.message || 'Something went wrong. Please try again.', limitReached: false };
}
