import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, spacing, shadows } from '../theme';

interface Props {
  children: React.ReactNode;
  accentColor?: string;
  style?: ViewStyle;
  noPadding?: boolean;
}

export function GlassCard({ children, accentColor, style, noPadding }: Props) {
  return (
    <View
      style={[
        styles.card,
        accentColor && { borderColor: accentColor + '30' },
        noPadding && { padding: 0 },
        shadows.sm,
        style,
      ]}
    >
      {accentColor && (
        <View style={[styles.accentLine, { backgroundColor: accentColor }]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
});
