import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Claude downsamples anything larger, so this keeps uploads small without losing detail. */
const MAX_EDGE = 1568;

export type PreparedPhoto = { uri: string; base64: string; mediaType: 'image/jpeg' };

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
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_EDGE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('Could not read photo.');
  return { uri: saved.uri, base64: saved.base64, mediaType: 'image/jpeg' };
}

function itemDir(itemId: string): Directory {
  return new Directory(Paths.document, 'items', itemId);
}

/** Copies prepared photos into permanent storage. Returns file names (paths are rebuilt at read time). */
export async function persistPhotos(itemId: string, photos: PreparedPhoto[], startIndex = 0): Promise<string[]> {
  const dir = itemDir(itemId);
  dir.create({ idempotent: true, intermediates: true });
  const names: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const name = `photo-${startIndex + i}-${Date.now()}.jpg`;
    await new File(photos[i].uri).copy(new File(dir, name));
    names.push(name);
  }
  return names;
}

export function photoUri(itemId: string, name: string): string {
  return new File(itemDir(itemId), name).uri;
}

export function photoExists(itemId: string, name: string): boolean {
  return new File(itemDir(itemId), name).exists;
}

export async function photoBase64(itemId: string, name: string): Promise<string | null> {
  const f = new File(itemDir(itemId), name);
  if (!f.exists) return null;
  return f.base64();
}

export function deleteItemPhotos(itemId: string) {
  const dir = itemDir(itemId);
  if (dir.exists) dir.delete();
}
