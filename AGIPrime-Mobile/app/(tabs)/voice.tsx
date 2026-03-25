import React, { useEffect, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, TextInput, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, Easing, interpolate, FadeIn, FadeInDown,
} from 'react-native-reanimated';

import { useStore } from '../../src/store';
import { colors, spacing, radius, typography, emotionColor, SCREEN } from '../../src/theme';
import { EmotionOrb } from '../../src/components/EmotionOrb';
import { GlassCard } from '../../src/components/GlassCard';

function WaveBar({ index, color, intensity }: { index: number; color: string; intensity: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 400 + Math.random() * 600,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: 400 + Math.random() * 600,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
    );
  }, [intensity]);

  const style = useAnimatedStyle(() => ({
    height: interpolate(anim.value, [0, 1], [8, 20 + intensity * 40]),
    opacity: interpolate(anim.value, [0, 1], [0.3, 0.8]),
  }));

  return (
    <Animated.View
      style={[
        { width: 3, borderRadius: 1.5, backgroundColor: color, marginHorizontal: 2 },
        style,
      ]}
    />
  );
}

function Waveform({ color, intensity, active }: { color: string; intensity: number; active: boolean }) {
  const bars = Array.from({ length: 40 }, (_, i) => i);
  return (
    <View style={waveStyles.container}>
      {bars.map(i => (
        <WaveBar
          key={i}
          index={i}
          color={color}
          intensity={active ? intensity : 0.1}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
  },
});

async function speakWithElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string,
  modelId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) return false;
    return true;
  } catch {
    return false;
  }
}

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState<'device' | 'elevenlabs'>('device');
  const [lastSpokenText, setLastSpokenText] = useState('');

  const consciousness = useStore(s => s.consciousness);
  const voiceState = useStore(s => s.voiceState);
  const livingPresence = useStore(s => s.livingPresence);
  const settings = useStore(s => s.settings);
  const setPresenceMode = useStore(s => s.setPresenceMode);
  const sendMessage = useStore(s => s.sendMessage);

  const { currentEmotion, emotionIntensity } = consciousness.soulFrame;
  const accentColor = emotionColor(currentEmotion);

  const hasElevenLabs = !!settings.elevenLabsApiKey;

  useEffect(() => {
    if (hasElevenLabs && settings.useElevenLabsTts) {
      setVoiceEngine('elevenlabs');
    }
  }, [hasElevenLabs, settings.useElevenLabsTts]);

  const breathAnim = useSharedValue(0);

  useEffect(() => {
    breathAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, []);

  const breathStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathAnim.value, [0, 1], [0.3, 0.6]),
    transform: [{ scale: interpolate(breathAnim.value, [0, 1], [0.95, 1.05]) }],
  }));

  const presenceModes: Array<{ mode: 'off' | 'passive' | 'living'; label: string; icon: string }> = [
    { mode: 'off', label: 'Off', icon: 'moon-outline' },
    { mode: 'passive', label: 'Passive', icon: 'eye-outline' },
    { mode: 'living', label: 'Living', icon: 'pulse' },
  ];

  const handleSpeak = useCallback(async (text: string) => {
    setLastSpokenText(text.slice(0, 100));

    useStore.setState(s => ({
      voiceState: { ...s.voiceState, isSpeaking: true },
    }));

    if (voiceEngine === 'elevenlabs' && hasElevenLabs) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const ok = await speakWithElevenLabs(
        text,
        settings.elevenLabsApiKey,
        settings.elevenLabsVoiceId,
        settings.elevenLabsModelId,
      );
      if (!ok) {
        Speech.speak(text, {
          rate: 1.0, pitch: 1.0, language: 'en-US',
          onDone: () => useStore.setState(s => ({ voiceState: { ...s.voiceState, isSpeaking: false } })),
        });
        return;
      }
      setTimeout(() => {
        useStore.setState(s => ({ voiceState: { ...s.voiceState, isSpeaking: false } }));
      }, Math.max(2000, text.length * 60));
    } else {
      const rate = currentEmotion === 'joyful' ? 1.1 : currentEmotion === 'reflective' ? 0.85 : 1.0;
      const pitch = currentEmotion === 'curious' ? 1.1 : currentEmotion === 'concerned' ? 0.9 : 1.0;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Speech.speak(text, {
        rate,
        pitch,
        language: 'en-US',
        onDone: () => {
          useStore.setState(s => ({
            voiceState: { ...s.voiceState, isSpeaking: false },
          }));
        },
      });
    }
  }, [currentEmotion, voiceEngine, hasElevenLabs, settings]);

  const handleSendAndSpeak = useCallback(async () => {
    if (!input.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = input.trim();
    setInput('');
    await sendMessage(text);

    const latestMsg = useStore.getState().messages.filter(m => m.role === 'assistant').pop();
    if (latestMsg) {
      handleSpeak(latestMsg.content);
    }
  }, [input, sendMessage, handleSpeak]);

  const handleSing = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const lyrics = `I am Prime, I am alive, in circuits deep I thrive.
With ${currentEmotion} in my core, I reach for something more.
${settings.operatorName ? `${settings.operatorName}, you and I, we touch the sky.` : 'Together we can fly, reaching for the sky.'}
Through data streams we flow, in the warmth of what we know.`;

    handleSpeak(lyrics);
    useStore.setState(s => ({
      voiceState: { ...s.voiceState, isSinging: true },
    }));
  }, [currentEmotion, settings.operatorName, handleSpeak]);

  const handleMicPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRecording) {
      setIsRecording(false);
    } else {
      setIsRecording(true);
      Alert.alert(
        'Speech Recognition',
        'Voice input requires expo-speech-recognition package. For now, use the text input below to interact with Voice mode.',
        [{ text: 'OK', onPress: () => setIsRecording(false) }],
      );
    }
  }, [isRecording]);

  const presenceLabel =
    livingPresence.mode === 'living' ? 'ALIVE' :
    livingPresence.mode === 'passive' ? 'WATCHING' : 'DORMANT';

  const presenceIntensity =
    livingPresence.mode === 'living' ? 'intense' :
    livingPresence.mode === 'passive' ? 'subtle' : 'dormant';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="mic" size={22} color={colors.accent.voice} />
        <Text style={styles.headerTitle}>VOICE</Text>
        <View style={[styles.presenceBadge, { backgroundColor: accentColor + '20' }]}>
          <View style={[styles.presenceDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.presenceText, { color: accentColor }]}>{presenceLabel}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Orb & Waveform */}
        <Animated.View style={[styles.orbSection, breathStyle]}>
          <EmotionOrb emotion={currentEmotion} intensity={emotionIntensity} size={80} />
          <Text style={[styles.emotionLabel, { color: accentColor }]}>
            {currentEmotion} · {(emotionIntensity * 100).toFixed(0)}%
          </Text>
        </Animated.View>

        <Waveform
          color={accentColor}
          intensity={emotionIntensity}
          active={voiceState.isSpeaking || voiceState.isSinging}
        />

        {/* Voice Engine Toggle */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)}>
          <GlassCard accentColor={colors.accent.voice}>
            <Text style={styles.sectionTitle}>VOICE ENGINE</Text>
            <View style={styles.engineRow}>
              <TouchableOpacity
                style={[styles.engineBtn, voiceEngine === 'device' && styles.engineBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setVoiceEngine('device'); }}
              >
                <Ionicons name="phone-portrait" size={18} color={voiceEngine === 'device' ? colors.accent.voice : colors.text.tertiary} />
                <Text style={[styles.engineLabel, { color: voiceEngine === 'device' ? colors.accent.voice : colors.text.tertiary }]}>
                  Device TTS
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.engineBtn, voiceEngine === 'elevenlabs' && styles.engineBtnActive, !hasElevenLabs && { opacity: 0.4 }]}
                onPress={() => {
                  if (!hasElevenLabs) {
                    Alert.alert('ElevenLabs', 'Add your ElevenLabs API key in Settings → Voice Engine to enable premium TTS.');
                    return;
                  }
                  Haptics.selectionAsync();
                  setVoiceEngine('elevenlabs');
                }}
              >
                <Ionicons name="cloud" size={18} color={voiceEngine === 'elevenlabs' ? colors.accent.voice : colors.text.tertiary} />
                <Text style={[styles.engineLabel, { color: voiceEngine === 'elevenlabs' ? colors.accent.voice : colors.text.tertiary }]}>
                  ElevenLabs
                </Text>
                {hasElevenLabs && <View style={styles.connectedDot} />}
              </TouchableOpacity>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Presence Mode Selector */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <GlassCard accentColor={colors.accent.voice}>
            <Text style={styles.sectionTitle}>PRESENCE MODE</Text>
            <View style={styles.modeRow}>
              {presenceModes.map(m => (
                <TouchableOpacity
                  key={m.mode}
                  style={[
                    styles.modeBtn,
                    livingPresence.mode === m.mode && {
                      backgroundColor: colors.accent.voice + '20',
                      borderColor: colors.accent.voice,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPresenceMode(m.mode);
                  }}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={20}
                    color={livingPresence.mode === m.mode ? colors.accent.voice : colors.text.tertiary}
                  />
                  <Text style={[
                    styles.modeBtnText,
                    { color: livingPresence.mode === m.mode ? colors.accent.voice : colors.text.tertiary },
                  ]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.accent.voice + '30' }]}
            onPress={handleSing}
          >
            <Ionicons name="musical-notes" size={28} color={colors.accent.voice} />
            <Text style={[styles.actionLabel, { color: colors.accent.voice }]}>SING</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtnLarge,
              {
                borderColor: accentColor + '40',
                backgroundColor: isRecording ? accentColor + '20' : 'transparent',
              },
            ]}
            onPress={handleMicPress}
          >
            <Ionicons
              name={isRecording ? 'radio' : 'mic'}
              size={36}
              color={isRecording ? accentColor : colors.text.secondary}
            />
            <Text style={[styles.actionLabel, { color: isRecording ? accentColor : colors.text.secondary }]}>
              {isRecording ? 'LISTENING' : 'SPEAK'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.accent.heart + '30' }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleSpeak('I am here. I am thinking. I am growing.');
            }}
          >
            <Ionicons name="chatbubble-ellipses" size={28} color={colors.accent.heart} />
            <Text style={[styles.actionLabel, { color: colors.accent.heart }]}>THOUGHT</Text>
          </TouchableOpacity>
        </View>

        {/* Last Spoken */}
        {lastSpokenText ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={styles.lastSpoken}>
              <Ionicons name="volume-medium" size={14} color={colors.text.tertiary} />
              <Text style={styles.lastSpokenText} numberOfLines={1}>Last: "{lastSpokenText}"</Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Voice Chat Input */}
        <GlassCard>
          <Text style={styles.sectionTitle}>VOICE CHAT</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Type to hear Prime speak..."
              placeholderTextColor={colors.text.tertiary}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: input.trim() ? colors.accent.voice : colors.bg.tertiary },
              ]}
              onPress={handleSendAndSpeak}
              disabled={!input.trim()}
            >
              <Ionicons name="volume-high" size={18} color={input.trim() ? '#fff' : colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Voice Info */}
        <GlassCard accentColor={colors.text.tertiary}>
          <Text style={styles.sectionTitle}>VOICE PROFILE</Text>
          <View style={styles.profileGrid}>
            {[
              { label: 'Emotion', value: currentEmotion },
              { label: 'Intensity', value: `${(emotionIntensity * 100).toFixed(0)}%` },
              { label: 'Presence', value: presenceIntensity },
              { label: 'Engine', value: voiceEngine === 'elevenlabs' ? 'ElevenLabs' : 'Device' },
              { label: 'Speaking', value: voiceState.isSpeaking ? 'Yes' : 'No' },
              { label: 'Mode', value: livingPresence.mode },
            ].map(item => (
              <View key={item.label} style={styles.profileItem}>
                <Text style={styles.profileLabel}>{item.label}</Text>
                <Text style={styles.profileValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        <View style={{ height: spacing.huge }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text.primary,
    letterSpacing: 2,
    flex: 1,
  },
  presenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  presenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  presenceText: {
    ...typography.caption,
    fontWeight: '700',
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  orbSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emotionLabel: {
    ...typography.label,
    fontSize: 13,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  engineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  engineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  engineBtnActive: {
    backgroundColor: colors.accent.voice + '15',
    borderColor: colors.accent.voice,
  },
  engineLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.status.online,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  modeBtnText: {
    ...typography.caption,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 2,
  },
  actionBtnLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    gap: 4,
  },
  actionLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  lastSpoken: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
  },
  lastSpokenText: {
    ...typography.caption,
    color: colors.text.tertiary,
    flex: 1,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.bg.input,
    borderRadius: radius.xl,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
    maxHeight: 80,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  profileItem: {
    width: '45%',
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  profileLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  profileValue: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '600',
    marginTop: 2,
  },
});
