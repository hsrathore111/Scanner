import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, TextInput, View } from 'react-native';

import { Bullet, Button, Card, Pill, Screen, T } from '@/components/ui';
import { Colors, Radius, Space } from '@/constants/theme';
import { useApp } from '@/context/app-context';
import { persistPhotos, pickPhoto, preparePhoto, type PhotoSource, type PreparedPhoto } from '@/lib/images';
import { appraise, describeAppraiseError, newItemId, setItemPhotos } from '@/lib/items';

const STATUS = [
  'Looking closely at your photo…',
  'Reading marks and labels…',
  'Searching recent sold listings…',
  'Checking auction results…',
  'Working out a fair price range…',
];

export default function Scan() {
  const { user, isPro, freeScansLeft, canScan } = useApp();
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStatusIdx((i) => Math.min(i + 1, STATUS.length - 1)), 6000);
    return () => clearInterval(t);
  }, [busy]);

  const choose = async (source: PhotoSource) => {
    setError(null);
    if (!canScan) {
      router.push('/paywall');
      return;
    }
    try {
      const asset = await pickPhoto(source);
      if (!asset) return;
      setPhoto(await preparePhoto(asset));
    } catch (e) {
      if ((e as Error).message === 'CAMERA_PERMISSION_DENIED') {
        setError('Camera access is off. Turn it on in Settings, or choose a photo from your library.');
      } else {
        setError('Could not open that photo. Try another one.');
      }
    }
  };

  const run = async () => {
    if (!user || !photo) return;
    setStatusIdx(0);
    setBusy(true);
    setError(null);
    const itemId = newItemId(user.uid);
    try {
      await appraise(itemId, [photo], note.trim() || undefined);
      const names = await persistPhotos(itemId, [photo]);
      await setItemPhotos(user.uid, itemId, names).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPhoto(null);
      setNote('');
      router.push(`/item/${itemId}`);
    } catch (e) {
      const { message, limitReached } = describeAppraiseError(e);
      if (limitReached) router.push('/paywall');
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (busy && photo) {
    return (
      <Screen edges={['top']} contentStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Image source={{ uri: photo.uri }} style={styles.busyPhoto} contentFit="cover" />
        <ActivityIndicator size="large" color={Colors.ink} />
        <T variant="heading" style={{ textAlign: 'center' }}>{STATUS[statusIdx]}</T>
        <T variant="caption" style={{ textAlign: 'center' }}>This usually takes 20–60 seconds.</T>
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top']}
      footer={
        photo ? (
          <View style={{ gap: Space.sm }}>
            <Button title="Find out what it's worth" icon="sparkles" onPress={run} />
            <Button title="Retake" variant="ghost" onPress={() => setPhoto(null)} />
          </View>
        ) : null
      }>
      <View style={styles.headerRow}>
        <T variant="title">Scan an item</T>
        {isPro ? (
          <Pill label="Pro" tone="brass" icon="star" />
        ) : (
          <Pill label={`${freeScansLeft} free ${freeScansLeft === 1 ? 'scan' : 'scans'} left`} tone={freeScansLeft ? 'neutral' : 'warn'} />
        )}
      </View>

      {photo ? (
        <>
          <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" />
          <Card>
            <T variant="heading">Anything we should know? (optional)</T>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. 'Marked Rookwood on the bottom', 'about 10 inches tall', 'belonged to my grandmother'"
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
            <Ionicons name="camera-outline" size={48} color={Colors.brassDark} />
            <T style={{ textAlign: 'center' }}>Fill the frame with the whole item, in good light.</T>
          </View>
          <Button title="Take a photo" icon="camera" onPress={() => choose('camera')} />
          <Button title="Choose from library" icon="images-outline" variant="secondary" onPress={() => choose('library')} />

          <Card>
            <T variant="heading">For the best result</T>
            <Bullet>Photograph against a plain background.</Bullet>
            <Bullet>Show any maker's mark, signature, label or stamp. We may ask for a close-up next.</Bullet>
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
  preview: { width: '100%', aspectRatio: 1, borderRadius: Radius.lg, backgroundColor: Colors.surfaceAlt },
  busyPhoto: { width: 180, height: 180, borderRadius: Radius.lg, marginBottom: Space.lg },
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
