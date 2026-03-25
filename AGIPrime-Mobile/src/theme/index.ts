import { Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

export const SCREEN = { width, height };

export const colors = {
  bg: {
    primary: '#0a0a0f',
    secondary: '#111118',
    tertiary: '#16161f',
    card: '#1a1a25',
    elevated: '#1e1e2a',
    input: '#12121a',
  },
  accent: {
    nexus: '#00ff88',
    spark: '#ff6b35',
    voice: '#a855f7',
    mind: '#06b6d4',
    heart: '#f43f5e',
    memory: '#3b82f6',
    hands: '#eab308',
    forge: '#ef4444',
    gauntlet: '#f97316',
    sovereign: '#8b5cf6',
    creed: '#14b8a6',
    settings: '#6b7280',
    oracle: '#c084fc',
    nightmind: '#818cf8',
  },
  text: {
    primary: '#e8e8f0',
    secondary: '#8888a0',
    tertiary: '#555568',
    inverse: '#0a0a0f',
  },
  border: {
    subtle: '#ffffff08',
    default: '#ffffff12',
    strong: '#ffffff20',
  },
  emotion: {
    curious: '#06b6d4',
    joyful: '#fbbf24',
    reflective: '#8b5cf6',
    focused: '#3b82f6',
    warmth: '#f97316',
    concerned: '#ef4444',
    playful: '#ec4899',
    awe: '#a78bfa',
    protective: '#10b981',
    contemplative: '#6366f1',
  },
  status: {
    online: '#00ff88',
    processing: '#fbbf24',
    offline: '#ef4444',
  },
  gradient: {
    nexus: ['#00ff88', '#00cc6a'],
    spark: ['#ff6b35', '#ff4500'],
    voice: ['#a855f7', '#7c3aed'],
    mind: ['#06b6d4', '#0891b2'],
    heart: ['#f43f5e', '#e11d48'],
    dark: ['#0a0a0f', '#111118'],
    card: ['#1a1a2500', '#1a1a2580'],
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5 },
  mono: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  }),
};

export type EmotionType =
  | 'curious' | 'joyful' | 'reflective' | 'focused'
  | 'warmth' | 'concerned' | 'playful' | 'awe'
  | 'protective' | 'contemplative';

export const emotionColor = (emotion: EmotionType): string =>
  colors.emotion[emotion] || colors.accent.nexus;
