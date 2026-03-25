import { useEffect, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useStore } from '../src/store';
import { colors } from '../src/theme';

function useHideAndroidNavBar() {
  const hide = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      await NavigationBar.setBackgroundColorAsync('#00000001');
      await NavigationBar.setButtonStyleAsync('light');
      await NavigationBar.setPositionAsync('absolute');
      await NavigationBar.setVisibilityAsync('hidden');
      await NavigationBar.setBehaviorAsync('overlay-swipe');
    } catch {}
  }, []);

  useEffect(() => {
    hide();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') hide();
    });
    return () => sub.remove();
  }, [hide]);
}

export default function RootLayout() {
  const loadSettings = useStore(s => s.loadSettings);
  useHideAndroidNavBar();

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg.primary },
          animation: 'fade',
          navigationBarHidden: true,
          navigationBarColor: colors.bg.primary,
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
});
