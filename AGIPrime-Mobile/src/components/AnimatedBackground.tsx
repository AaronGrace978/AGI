import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import { colors, SCREEN, emotionColor, EmotionType } from '../theme';

interface Props {
  emotion?: EmotionType;
  intensity?: number;
}

function Particle({ delay, x, emotion }: { delay: number; x: number; emotion: EmotionType }) {
  const progress = useSharedValue(0);
  const color = emotionColor(emotion);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 8000 + Math.random() * 6000, easing: Easing.linear }),
        -1,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [SCREEN.height + 10, -20]) },
    ],
    opacity: interpolate(progress.value, [0, 0.1, 0.9, 1], [0, 0.3, 0.3, 0]),
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: 'absolute',
          left: x,
          width: 2,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
        },
      ]}
    />
  );
}

export function AnimatedBackground({ emotion = 'curious', intensity = 0.5 }: Props) {
  const particles = useMemo(() => {
    const count = Math.floor(12 + intensity * 8);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * SCREEN.width,
      delay: Math.random() * 5000,
    }));
  }, [intensity]);

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map(p => (
        <Particle key={p.id} x={p.x} delay={p.delay} emotion={emotion} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});
