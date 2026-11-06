import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, T, type IconName } from '@/components/ui';
import { Colors, Radius, Space } from '@/constants/theme';

const STEPS: { icon: IconName; kicker: string; title: string; body: string }[] = [
  {
    icon: 'camera-outline',
    kicker: 'Snap it',
    title: "What's in the attic might be worth something.",
    body: "Photograph any old item, from Grandma's china to a flea-market find, and learn what it is in under a minute.",
  },
  {
    icon: 'pricetags-outline',
    kicker: 'See the evidence',
    title: 'A value range backed by real sales.',
    body: "We search recent sold listings and auction results, then show you the comparables, a price range and how confident we are. You don't get one made-up number.",
  },
  {
    icon: 'storefront-outline',
    kicker: 'Sell smarter',
    title: 'Know where to sell, and for how much.',
    body: 'Get the best places to sell, what the fees look like, and the details buyers care about. Keep everything in a collection with its total value.',
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Screen
      edges={['top', 'bottom']}
      contentStyle={{ flex: 1, justifyContent: 'center' }}
      footer={
        <View style={{ gap: Space.md }}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>
          <Button
            title={last ? 'Get started' : 'Continue'}
            onPress={() => (last ? router.push('/paywall?source=onboarding') : setStep(step + 1))}
          />
        </View>
      }>
      <View style={styles.hero}>
        <View style={styles.iconRing}>
          <Ionicons name={s.icon} size={56} color={Colors.brassDark} />
        </View>
      </View>
      <T variant="label">{s.kicker}</T>
      <T variant="display">{s.title}</T>
      <T style={{ fontSize: 17, lineHeight: 25 }}>{s.body}</T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'flex-start', marginBottom: Space.md },
  iconRing: {
    width: 112,
    height: 112,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brassTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.line },
  dotActive: { width: 22, backgroundColor: Colors.ink },
});
