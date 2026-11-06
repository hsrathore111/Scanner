import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, T } from '@/components/ui';
import { Colors, Space } from '@/constants/theme';
import { AppProvider, useApp } from '@/context/app-context';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { ready, onboarded, user, authError, retryAuth } = useApp();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  if (!user && authError) {
    return (
      <View style={styles.center}>
        <T variant="title" style={{ textAlign: 'center' }}>Can't connect</T>
        <T style={{ textAlign: 'center' }}>Check your internet connection and try again.</T>
        <Button title="Try again" onPress={retryAuth} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.ink,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.xl, gap: Space.lg, backgroundColor: Colors.background },
});
