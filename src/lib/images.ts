import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';

import { storage } from './firebase';

/** Claude downsamples anything larger, so this keeps uploads small without losing detail. */
const MAX_EDGE = 1568;

export type PreparedPhoto = { uri: string; base64: string };
export type PhotoSource = 'camera' | 'library';

export async function pickPhoto(source: PhotoSource): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('CAMERA_PERMISSION_DENIED');
    const res = await ImagePicker.launchCameraAsync({ quality: 1 });
    return res.canceled ? null : res.assets[0];
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  return res.canceled ? null : res.assets[0];
}

/** Resize so the longest edge is at most MAX_EDGE, then JPEG-encode with base64. */
export async function preparePhoto(asset: { uri: string; width: number; height: number }): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_EDGE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('Could not read photo.');
  return { uri: saved.uri, base64: saved.base64 };
}

const urlCache = new Map<string, string>();

export async function photoUrl(path: string): Promise<string> {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const url = await getDownloadURL(ref(storage, path));
  urlCache.set(path, url);
  return url;
}

/** Resolves a Storage path to a URL for expo-image, which caches the bytes on disk. */
export function usePhotoUrl(path: string | undefined): string | null {
  const [fetched, setFetched] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    photoUrl(path)
      .then((url) => live && setFetched({ path, url }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  if (!path) return null;
  return urlCache.get(path) ?? (fetched?.path === path ? fetched.url : null);
}

/** Base64 for embedding in a PDF. iOS can't load remote or local image URLs when printing HTML. */
export async function photoBase64(path: string): Promise<string | null> {
  try {
    const name = `report-${path.replace(/[^A-Za-z0-9]/g, '')}`;
    const dest = new File(Paths.cache, name);
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(await photoUrl(path), dest);
    return await file.base64();
  } catch {
    return null;
  }
}
