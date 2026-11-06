import AsyncStorage from '@react-native-async-storage/async-storage';
// firebase/auth's typings omit the React Native build; @firebase/auth (which it re-exports) has them.
import { getReactNativePersistence } from '@firebase/auth';
import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { Platform } from 'react-native';

import { firebaseConfig } from '@/constants/config';

export const firebaseApp = initializeApp(firebaseConfig);

// Keeps the anonymous user signed in across app restarts.
export const auth: Auth =
  Platform.OS === 'web'
    ? getAuth(firebaseApp)
    : initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });

export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, 'us-central1');
