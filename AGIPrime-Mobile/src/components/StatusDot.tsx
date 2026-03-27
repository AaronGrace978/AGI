import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, Easing,
} from 'react-native-reanimated';
import { colors } from '../theme';

interface Props {
  status: 'online' | 'processing' | 'offline';
  size?: number;
}

export function StatusDot({ status, size = 8 }: Props) {
  const opacity = useSharedValue(1);
  const color = colors.status[status];

  useEffect(() => {
    if (status === 'processing') {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
    }
  }, [status]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        animStyle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 4,
          elevation: 3,
        },
      ]}
    />
  );
}
