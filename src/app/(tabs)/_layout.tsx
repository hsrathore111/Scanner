import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.muted,
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Collection',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan-circle-outline" size={size + 4} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
