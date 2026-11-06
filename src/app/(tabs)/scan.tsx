import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Bullet, Button, Card, Pill, Screen, T } from '@/components/ui';
import { LEGAL } from '@/constants/config';
import { Colors, Radius, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
import { pickPhoto, preparePhoto, type PhotoSource, type PreparedPhoto } from '@/lib/images';
import { describeError, newItemId, startAppraisal } from '@/lib/items';

const MAX_PHOTOS = 3;

export default function Scan() {
  const { user, isPro, freeScansLeft, canScan, aiConsent, giveAiConsent } = useApp();
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [note, setNote] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState(false);

  const add = async (source: PhotoSource) => {
    setError(null);
    if (!canScan) {
      router.push('/paywall');
      return;
    }
    try {
      const asset = await pickPhoto(source);
      if (!asset) return;
      setPreparing(true);
      const prepared = await preparePhoto(asset);
      setPhotos((p) => [...p, prepared].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(
        (e as Error).message === 'CAMERA_PERMISSION_DENIED'
          ? 'Camera access is off. Turn it on in Settings, or choose a photo from your library.'
          : 'Could not open that photo. Try another one.',
      );
    } finally {
      setPreparing(false);
    }
  };

  const run = async () => {
    if (!user || !photos.length) return;
    if (!aiConsent) {
      setAskConsent(true);
      return;
    }
    setUploading(true);
    setError(null);
    const itemId = newItemId(user.uid);
    try {
      await startAppraisal(itemId, photos, note.trim() || undefined);
      setPhotos([]);
      setNote('');
      router.push(`/item/${itemId}`);
    } catch (e) {
      const { message, limitReached } = describeError(e);
      if (limitReached) router.push('/paywall');
      else setError(message);
    } finally {
      setUploading(false);
    }
  };

  const accept = async () => {
    await giveAiConsent();
    setAskConsent(false);
  };

  const footer = askConsent ? (
    <View style={{ gap: Space.sm }}>
      <T variant="heading">Before we look at your photos</T>
      <T>
        To identify your item, your photos and any note you add are sent to our servers and to Anthropic, which runs the
        Claude AI that analyzes them. They're used to create your appraisal. Your photos are saved with your account until
        you delete them.
      </T>
      <Pressable onPress={() => Linking.openURL(LEGAL.privacyUrl)} hitSlop={8}>
        <T variant="caption" style={{ textDecorationLine: 'underline' }}>Read the privacy policy</T>
      </Pressable>
      <Button title="Agree and continue" onPress={accept} />
      <Button title="Not now" variant="ghost" onPress={() => setAskConsent(false)} />
    </View>
  ) : photos.length ? (
    <View style={{ gap: Space.sm }}>
      <Button title="Find out what it's worth" icon="sparkles" onPress={run} loading={uploading} />
      <Button title="Start over" variant="ghost" onPress={() => setPhotos([])} disabled={uploading} />
    </View>
  ) : null;

  return (
    <Screen edges={['top']} footer={footer}>
      <View style={styles.headerRow}>
        <T variant="title">Scan an item</T>
        {isPro ? (
          <Pill label="Pro" tone="brass" icon="star" />
        ) : (
          <Pill label={`${freeScansLeft} free ${freeScansLeft === 1 ? 'scan' : 'scans'} left`} tone={freeScansLeft ? 'neutral' : 'warn'} />
        )}
      </View>

      {photos.length ? (
        <>
          <View style={styles.thumbs}>
            {photos.map((p, i) => (
              <View key={p.uri} style={styles.thumbWrap}>
                <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                <Pressable
                  accessibilityLabel="Remove photo"
                  hitSlop={8}
                  style={styles.remove}
                  onPress={() => setPhotos((list) => list.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable style={[styles.thumbWrap, styles.addThumb]} onPress={() => add('camera')} accessibilityRole="button" accessibilityLabel="Add another photo">
                {preparing ? <ActivityIndicator color={Colors.ink} /> : <Ionicons name="add" size={28} color={Colors.brassDark} />}
              </Pressable>
            ) : null}
          </View>
          <T variant="caption">Add the underside, a label or a maker's mark for a sharper answer.</T>
          <Card>
            <T variant="heading">Anything we should know? (optional)</T>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. 'Marked Rookwood on the bottom', 'about 10 inches tall', 'came from my grandmother in Ohio'"
              placeholderTextColor={Colors.muted}
              multiline
              maxLength={500}
              style={styles.input}
            />
          </Card>
        </>
      ) : (
        <>
          <View style={styles.cameraBox}>
            {preparing ? <ActivityIndicator size="large" color={Colors.ink} /> : <Ionicons name="camera-outline" size={48} color={Colors.brassDark} />}
            <T style={{ textAlign: 'center' }}>Fill the frame with the whole item, in good light.</T>
          </View>
          <Button title="Take a photo" icon="camera" onPress={() => add('camera')} />
          <Button title="Choose from library" icon="images-outline" variant="secondary" onPress={() => add('library')} />
          <Card>
            <T variant="heading">For the best result</T>
            <Bullet>Photograph against a plain background.</Bullet>
            <Bullet>Show any maker's mark, signature, label or stamp. You can add up to {MAX_PHOTOS} photos.</Bullet>
            <Bullet>Include chips, cracks or wear. Condition changes the price a lot.</Bullet>
          </Card>
        </>
      )}

      {error ? (
        <Card style={{ backgroundColor: Colors.dangerTint, borderColor: Colors.dangerTint }}>
          <T style={{ color: Colors.danger }}>{error}</T>
          {error.startsWith('Camera access') ? (
            <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Space.sm },
  cameraBox: {
    aspectRatio: 4 / 3,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.brass,
    backgroundColor: Colors.brassTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    padding: Space.xl,
  },
  thumbs: { flexDirection: 'row', gap: Space.sm },
  thumbWrap: { flex: 1, maxWidth: '33%', aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%', backgroundColor: Colors.surfaceAlt },
  addThumb: { backgroundColor: Colors.brassTint, alignItems: 'center', justifyContent: 'center' },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 72,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Space.md,
    fontSize: 15,
    color: Colors.ink,
    textAlignVertical: 'top',
  },
});
