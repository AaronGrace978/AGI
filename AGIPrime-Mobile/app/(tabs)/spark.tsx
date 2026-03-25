import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle, withRepeat,
  withTiming, withSequence, Easing, interpolate,
} from 'react-native-reanimated';

import { useStore } from '../../src/store';
import { colors, spacing, radius, typography, emotionColor } from '../../src/theme';
import { GlassCard } from '../../src/components/GlassCard';
import { AnimatedBackground } from '../../src/components/AnimatedBackground';

function ThermoGauge({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const width = Math.max(0, Math.min(100, value * 100));
  return (
    <View style={gaugeStyles.container}>
      <View style={gaugeStyles.header}>
        <Text style={gaugeStyles.icon}>{icon}</Text>
        <Text style={[gaugeStyles.label, { color }]}>{label}</Text>
        <Text style={[gaugeStyles.value, { color }]}>{(value * 100).toFixed(0)}%</Text>
      </View>
      <View style={gaugeStyles.track}>
        <Animated.View
          style={[
            gaugeStyles.fill,
            { width: `${width}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  icon: { fontSize: 14 },
  label: { ...typography.caption, flex: 1 },
  value: { ...typography.caption, fontWeight: '700' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg.tertiary,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});

function IgniteButton({ ignited, onPress }: { ignited: boolean; onPress: () => void }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (ignited) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
  }, [ignited]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(pulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.02]) }],
  }));

  return (
    <Animated.View style={glowStyle}>
      <TouchableOpacity
        style={[
          igniteStyles.btn,
          {
            backgroundColor: ignited ? colors.accent.spark + '20' : colors.bg.card,
            borderColor: ignited ? colors.accent.spark : colors.border.default,
            shadowColor: colors.accent.spark,
          },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          onPress();
        }}
      >
        <Ionicons
          name={ignited ? 'flame' : 'flame-outline'}
          size={24}
          color={ignited ? colors.accent.spark : colors.text.secondary}
        />
        <Text style={[
          igniteStyles.text,
          { color: ignited ? colors.accent.spark : colors.text.secondary },
        ]}>
          {ignited ? 'IGNITED' : 'IGNITE'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const igniteStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 4,
  },
  text: {
    ...typography.label,
    fontSize: 14,
  },
});

export default function SparkScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');

  const spark = useStore(s => s.spark);
  const sparkLiveLog = useStore(s => s.sparkLiveLog);
  const consciousness = useStore(s => s.consciousness);
  const sparkIgnite = useStore(s => s.sparkIgnite);
  const sparkExtinguish = useStore(s => s.sparkExtinguish);
  const sparkFeedInput = useStore(s => s.sparkFeedInput);

  const { thermo, worldModel, curiosity, goals, metacognition } = spark;
  const { currentEmotion, emotionIntensity } = consciousness.soulFrame;

  const handleFeed = () => {
    if (!input.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sparkFeedInput(input.trim());
    setInput('');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AnimatedBackground emotion={currentEmotion} intensity={0.2} />

      <View style={styles.header}>
        <Ionicons name="flash" size={22} color={colors.accent.spark} />
        <Text style={styles.headerTitle}>SPARK</Text>
        <Text style={styles.headerSub}>Cycle #{spark.cycleCount}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Ignite Control */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          <IgniteButton
            ignited={thermo.ignited}
            onPress={thermo.ignited ? sparkExtinguish : sparkIgnite}
          />
        </Animated.View>

        {/* Thermodynamics */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <GlassCard accentColor={colors.accent.spark}>
            <Text style={styles.sectionTitle}>Thermodynamics</Text>
            <ThermoGauge label="TEMPERATURE" value={thermo.temperature} color="#ef4444" icon="🌡️" />
            <ThermoGauge label="ENTROPY" value={thermo.entropy} color="#a855f7" icon="🌀" />
            <ThermoGauge label="ENERGY" value={Math.min(1, thermo.energy / 100)} color="#fbbf24" icon="⚡" />
            <View style={styles.thermoStats}>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{thermo.lightCycles}</Text>
                <Text style={styles.statLabel}>Light</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{thermo.mediumCycles}</Text>
                <Text style={styles.statLabel}>Medium</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{thermo.deepCycles}</Text>
                <Text style={styles.statLabel}>Deep</Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* World Model */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <GlassCard accentColor={colors.accent.mind}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>World Model</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{worldModel.entities.length}</Text>
              </View>
            </View>
            {worldModel.entities.length === 0 ? (
              <Text style={styles.emptyText}>Feed input to build the knowledge graph</Text>
            ) : (
              worldModel.entities.slice(-8).map((entity, i) => (
                <View key={entity.id} style={styles.entityRow}>
                  <View style={[styles.entityDot, { backgroundColor: colors.accent.mind }]} />
                  <View style={styles.entityInfo}>
                    <Text style={styles.entityName}>{entity.name}</Text>
                    <Text style={styles.entityType}>{entity.type}</Text>
                  </View>
                  <Text style={styles.entityConf}>{(entity.confidence * 100).toFixed(0)}%</Text>
                </View>
              ))
            )}
          </GlassCard>
        </Animated.View>

        {/* Curiosity Engine */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <GlassCard accentColor="#06b6d4">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Curiosity</Text>
              <Text style={[styles.driveScore, { color: '#06b6d4' }]}>
                Drive: {(curiosity.driveScore * 100).toFixed(0)}%
              </Text>
            </View>
            {curiosity.questions.length === 0 ? (
              <Text style={styles.emptyText}>No questions yet — curiosity awakens with input</Text>
            ) : (
              curiosity.questions.filter(q => q.status === 'open').slice(-5).map(q => (
                <View key={q.id} style={styles.questionRow}>
                  <Ionicons name="help-circle-outline" size={16} color="#06b6d4" />
                  <Text style={styles.questionText} numberOfLines={2}>{q.question}</Text>
                </View>
              ))
            )}
          </GlassCard>
        </Animated.View>

        {/* Goals */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <GlassCard accentColor={colors.accent.nexus}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Goals</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{goals.active.length}</Text>
              </View>
            </View>
            {goals.active.length === 0 ? (
              <Text style={styles.emptyText}>No active goals</Text>
            ) : (
              goals.active.slice(-5).map(g => (
                <View key={g.id} style={styles.goalRow}>
                  <View style={styles.goalProgress}>
                    <View style={[styles.goalProgressFill, { width: `${g.progress * 100}%` }]} />
                  </View>
                  <Text style={styles.goalText} numberOfLines={1}>{g.description}</Text>
                </View>
              ))
            )}
          </GlassCard>
        </Animated.View>

        {/* Meta-Cognition */}
        <Animated.View entering={FadeInDown.delay(500).duration(400)}>
          <GlassCard accentColor="#8b5cf6">
            <Text style={styles.sectionTitle}>Meta-Cognition</Text>
            <ThermoGauge
              label="CALIBRATION"
              value={metacognition.calibration}
              color="#8b5cf6"
              icon="🎯"
            />
            {metacognition.limitations.length > 0 && (
              <View style={styles.limitationsList}>
                {metacognition.limitations.slice(0, 3).map((l, i) => (
                  <Text key={i} style={styles.limitationText}>• {l}</Text>
                ))}
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {/* Live Log */}
        <Animated.View entering={FadeInDown.delay(600).duration(400)}>
          <GlassCard accentColor={colors.text.tertiary}>
            <Text style={styles.sectionTitle}>Live Log</Text>
            <View style={styles.logContainer}>
              {sparkLiveLog.length === 0 ? (
                <Text style={styles.emptyText}>Awaiting SPARK activity...</Text>
              ) : (
                sparkLiveLog.slice(-10).map((line, i) => (
                  <Text key={i} style={styles.logLine}>{line}</Text>
                ))
              )}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Input */}
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Feed SPARK..."
              placeholderTextColor={colors.text.tertiary}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.feedBtn,
                { backgroundColor: input.trim() ? colors.accent.spark : colors.bg.tertiary },
              ]}
              onPress={handleFeed}
              disabled={!input.trim() || spark.phase === 'processing'}
            >
              <Ionicons name="flash" size={18} color={input.trim() ? '#fff' : colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        </View>

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
  headerSub: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  badge: {
    backgroundColor: colors.bg.tertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  thermoStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  statValue: {
    ...typography.h3,
    color: colors.text.primary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  entityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  entityInfo: { flex: 1 },
  entityName: {
    ...typography.bodySmall,
    color: colors.text.primary,
    fontWeight: '500',
  },
  entityType: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  entityConf: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  driveScore: {
    ...typography.caption,
    fontWeight: '700',
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  questionText: {
    ...typography.bodySmall,
    color: colors.text.primary,
    flex: 1,
  },
  goalRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  goalProgress: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.bg.tertiary,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: colors.accent.nexus,
    borderRadius: 1.5,
  },
  goalText: {
    ...typography.bodySmall,
    color: colors.text.primary,
  },
  limitationsList: {
    gap: spacing.xs,
  },
  limitationText: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
  },
  logContainer: {
    backgroundColor: colors.bg.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    maxHeight: 200,
  },
  logLine: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: colors.accent.spark,
    lineHeight: 18,
  },
  inputArea: {
    marginTop: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.bg.input,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accent.spark + '20',
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
  feedBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
