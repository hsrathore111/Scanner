import AsyncStorage from '@react-native-async-storage/async-storage';
// firebase/auth's typings omit the React Native build; @firebase/auth (which it re-exports) has them.
import { getReactNativePersistence } from '@firebase/auth';
import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { firebaseConfig, firebaseConfigured } from '@/constants/config';

// Placeholders let the app start and explain what's missing instead of crashing on launch.
export const firebaseApp = initializeApp(
  firebaseConfigured ? firebaseConfig : { apiKey: 'missing', projectId: 'missing', appId: 'missing' },
);

// Keeps the user signed in across app restarts.
export const auth: Auth =
  Platform.OS === 'web'
    ? getAuth(firebaseApp)
    : initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });

export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, 'us-central1');
export const storage = getStorage(firebaseApp);
