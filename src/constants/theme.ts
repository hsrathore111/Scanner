import { Platform } from 'react-native';

/** Warm "paper and brass" palette. Light-only for v1 (app.json sets userInterfaceStyle: light). */
export const Colors = {
  background: '#F6F1E9',
  surface: '#FFFFFF',
  surfaceAlt: '#EFE8DC',
  ink: '#1E1914',
  inkSoft: '#4A4239',
  muted: '#7A7064',
  line: '#E3DACB',
  brass: '#A8741F',
  brassDark: '#7E5410', // text-safe on white
  brassTint: '#F4E7CF',
  success: '#2E7550',
  successTint: '#E1F0E6',
  warning: '#9A6200',
  warningTint: '#FBEFD6',
  danger: '#B3261E',
  dangerTint: '#F9E1DF',
  overlay: 'rgba(30,25,20,0.55)',
} as const;

export const Fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const Radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

/** Content never grows wider than this, so tablets and large Android phones stay readable. */
export const MaxContentWidth = 640;
