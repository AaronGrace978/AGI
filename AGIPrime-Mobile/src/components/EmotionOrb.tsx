import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, interpolate, Easing,
} from 'react-native-reanimated';
import { emotionColor, EmotionType } from '../theme';

interface Props {
  emotion: EmotionType;
  intensity: number;
  size?: number;
}

export function EmotionOrb({ emotion, intensity, size = 60 }: Props) {
  const pulse = useSharedValue(0);
  const glow = useSharedValue(0);
  const color = emotionColor(emotion);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 + (1 - intensity) * 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2000 + (1 - intensity) * 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [emotion, intensity]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.95, 1.05 + intensity * 0.1]) }],
    opacity: interpolate(glow.value, [0, 1], [0.7, 1]),
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.4 + intensity * 0.3]) }],
    opacity: interpolate(glow.value, [0, 1], [0.15, 0.35 * intensity]),
  }));

  return (
    <View style={[styles.container, { width: size * 2, height: size * 2 }]}>
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          {
            width: size * 1.8,
            height: size * 1.8,
            borderRadius: size,
            backgroundColor: color,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          orbStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            shadowColor: color,
            shadowRadius: 20 * intensity,
            shadowOpacity: 0.6,
          },
        ]}
      />
      <View
        style={[
          styles.inner,
          {
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: size * 0.25,
            backgroundColor: '#fff',
            opacity: 0.15 + intensity * 0.15,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  orb: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  inner: {
    position: 'absolute',
  },
});
