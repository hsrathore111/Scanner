// @firebase/auth ships getReactNativePersistence only in its React Native build, whose typings
// TypeScript doesn't pick up. Metro resolves the RN build at runtime, so declare the export here.
import type { Persistence } from '@firebase/auth';

declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
