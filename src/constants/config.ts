import { Platform } from 'react-native';

/** Keep FREE_SCANS in sync with functions/src/index.ts. */
export const FREE_SCANS = 3;

/** RevenueCat entitlement that unlocks unlimited scans, collection value and selling guidance. */
export const PRO_ENTITLEMENT = 'pro';

/** One-time (consumable) in-app purchase for a PDF appraisal report. Create it in App Store Connect / Play Console. */
export const REPORT_PRODUCT_ID = 'heirloom_item_report';

export const REVENUECAT_API_KEY =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) ?? '';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const LEGAL = {
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://example.com/privacy',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@example.com',
};
