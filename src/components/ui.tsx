import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Colors, Fonts, MaxContentWidth, Radius, Space } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Full-screen container: safe areas, paper background, and a centered column capped at MaxContentWidth. */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
  footer,
  ...scrollProps
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
} & ScrollViewProps) {
  const inner = <View style={[styles.column, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" {...scrollProps}>
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, { flex: 1 }]}>{inner}</View>
      )}
      {footer ? (
        <View style={styles.footer}>
          <View style={styles.column}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

type Variant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label';

export function T({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text style={[textStyles[variant], style]} {...props} />;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const fg = variant === 'primary' ? '#FFFFFF' : Colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        pressed && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <T variant="label">{children}</T>
      {right}
    </View>
  );
}

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brass'; icon?: IconName }) {
  const map = {
    neutral: [Colors.surfaceAlt, Colors.inkSoft],
    good: [Colors.successTint, Colors.success],
    warn: [Colors.warningTint, Colors.warning],
    bad: [Colors.dangerTint, Colors.danger],
    brass: [Colors.brassTint, Colors.brassDark],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={13} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Bullet({ children, icon = 'ellipse', color = Colors.brass }: { children: ReactNode; icon?: IconName; color?: string }) {
  return (
    <View style={styles.bullet}>
      <Ionicons name={icon} size={icon === 'ellipse' ? 7 : 18} color={color} style={{ marginTop: icon === 'ellipse' ? 8 : 1 }} />
      <T style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: Space.lg, paddingVertical: Space.lg, flexGrow: 1 },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Space.lg },
  footer: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.line,
    backgroundColor: Colors.background,
  },
  btn: {
    minHeight: 52,
    borderRadius: Radius.md,
    paddingHorizontal: Space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  btnPrimary: { backgroundColor: Colors.ink },
  btnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  btnGhost: { backgroundColor: 'transparent', minHeight: 44 },
  btnText: { fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    gap: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.line,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  bullet: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
});

const textStyles = StyleSheet.create({
  display: { fontFamily: Fonts.serif, fontSize: 34, lineHeight: 40, color: Colors.ink, fontWeight: '700' },
  title: { fontFamily: Fonts.serif, fontSize: 26, lineHeight: 32, color: Colors.ink, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, color: Colors.ink, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, color: Colors.inkSoft },
  caption: { fontSize: 13, lineHeight: 18, color: Colors.muted },
  label: { fontSize: 12, lineHeight: 16, color: Colors.brassDark, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});
