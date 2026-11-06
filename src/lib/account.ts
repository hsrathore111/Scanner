import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  linkWithCredential,
  OAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  type AuthCredential,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { auth, functions } from './firebase';

export function appleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

export function isSignedIn(): boolean {
  return !!auth.currentUser && !auth.currentUser.isAnonymous;
}

async function appleCredential(): Promise<AuthCredential> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const apple = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  });
  if (!apple.identityToken) throw new Error('Apple did not return a sign-in token.');
  return new OAuthProvider('apple.com').credential({ idToken: apple.identityToken, rawNonce });
}

/**
 * Upgrades the anonymous account in place, so the collection and free-scan count carry over.
 * If this Apple ID already has an account (a new phone), signs in to that one instead.
 * Returns false when the user cancels Apple's sheet.
 */
export async function signInWithApple(): Promise<boolean> {
  let credential: AuthCredential;
  try {
    credential = await appleCredential();
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
  const current = auth.currentUser;
  if (!current) {
    await signInWithCredential(auth, credential);
    return true;
  }
  try {
    await linkWithCredential(current, credential);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code !== 'auth/credential-already-in-use') throw e;
    const existing = OAuthProvider.credentialFromError(e as never);
    if (!existing) throw e;
    await signInWithCredential(auth, existing);
  }
  return true;
}

/** Signing out starts a fresh anonymous session (see AppProvider). */
export function signOut() {
  return firebaseSignOut(auth);
}

/** Deletes the account, collection and photos everywhere, then starts a fresh anonymous session. */
export async function deleteAccount() {
  await httpsCallable(functions, 'deleteAccount', { timeout: 120_000 })();
  await firebaseSignOut(auth);
}
