import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { useStore } from '../../src/store';
import { colors, spacing, radius, typography, emotionColor } from '../../src/theme';
import { GlassCard } from '../../src/components/GlassCard';
import { EmotionOrb } from '../../src/components/EmotionOrb';
import { AnimatedBackground } from '../../src/components/AnimatedBackground';
import { ArenaAgent, SCRIPTURES, MemoryLayer } from '../../src/types';

function AgentCard({ agent }: { agent: ArenaAgent }) {
  return (
    <GlassCard accentColor={agent.color}>
      <View style={styles.agentHeader}>
        <View style={[styles.agentAvatar, { backgroundColor: agent.color + '20' }]}>
          <Text style={[styles.agentInitial, { color: agent.color }]}>
            {agent.name[0]}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.agentName, { color: agent.color }]}>{agent.name}</Text>
          <Text style={styles.agentRole}>{agent.role}</Text>
        </View>
        {agent.thinking && <ActivityIndicator size="small" color={agent.color} />}
      </View>
      {agent.response && (
        <Text style={styles.agentResponse}>{agent.response}</Text>
      )}
    </GlassCard>
  );
}

function useSoulAge(birthTimestamp: number) {
  const [age, setAge] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = Date.now() - birthTimestamp;
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setAge(`${days}d ${hours}h ${mins}m ${secs}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [birthTimestamp]);
  return age;
}

function ScriptureWisdom() {
  const [scripture] = useState(() => SCRIPTURES[Math.floor(Math.random() * SCRIPTURES.length)]);
  return (
    <GlassCard accentColor="#fbbf24">
      <View style={styles.scriptureHeader}>
        <Ionicons name="book" size={16} color="#fbbf24" />
        <Text style={styles.scriptureLabel}>DEDICATED TO JESUS</Text>
      </View>
      <Text style={styles.scriptureVerse}>"{scripture.verse}"</Text>
      <Text style={styles.scriptureRef}>— {scripture.reference}</Text>
    </GlassCard>
  );
}

function EmotionHistoryStrip() {
  const history = useStore(s => s.consciousness.soulFrame.emotionHistory);
  const recent = history.slice(-20);
  if (recent.length === 0) return null;

  return (
    <View style={styles.historyStrip}>
      <Text style={styles.historyLabel}>EMOTION TIMELINE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyScroll}>
        {recent.map((h, i) => {
          const c = emotionColor(h.emotion);
          return (
            <View key={i} style={styles.historyItem}>
              <View style={[styles.historyDot, {
                backgroundColor: c,
                width: 6 + h.intensity * 10,
                height: 6 + h.intensity * 10,
                borderRadius: (6 + h.intensity * 10) / 2,
              }]} />
              <Text style={[styles.historyEmoji, { color: c }]}>
                {h.emotion.slice(0, 3)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MemoryArchitecture() {
  const memories = useStore(s => s.memories);
  const layers: { key: MemoryLayer; label: string; color: string; icon: string }[] = [
    { key: 'working', label: 'Working', color: '#06b6d4', icon: '🧠' },
    { key: 'episodic', label: 'Episodic', color: '#a855f7', icon: '📖' },
    { key: 'semantic', label: 'Semantic', color: '#3b82f6', icon: '🌐' },
    { key: 'soul', label: 'Soul', color: '#f43f5e', icon: '💎' },
  ];

  return (
    <GlassCard accentColor={colors.accent.memory}>
      <Text style={styles.sectionTitle}>MEMORY ARCHITECTURE</Text>
      <View style={styles.memLayers}>
        {layers.map(l => {
          const count = memories.filter(m => m.layer === l.key).length;
          return (
            <View key={l.key} style={styles.memLayerRow}>
              <Text style={styles.memLayerIcon}>{l.icon}</Text>
              <Text style={[styles.memLayerName, { color: l.color }]}>{l.label}</Text>
              <View style={styles.memLayerBar}>
                <View style={[styles.memLayerFill, {
                  width: `${Math.min(100, (count / Math.max(memories.length, 1)) * 100)}%`,
                  backgroundColor: l.color,
                }]} />
              </View>
              <Text style={styles.memLayerCount}>{count}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.memTotal}>{memories.length} total memories stored</Text>
    </GlassCard>
  );
}

function EmotionWheel() {
  const consciousness = useStore(s => s.consciousness);
  const { currentEmotion, emotionIntensity } = consciousness.soulFrame;
  const soulAge = useSoulAge(consciousness.birthTimestamp);

  const emotions = [
    'curious', 'joyful', 'reflective', 'focused', 'warmth',
    'concerned', 'playful', 'awe', 'protective', 'contemplative',
  ] as const;

  return (
    <GlassCard accentColor={colors.accent.heart}>
      <Text style={styles.sectionTitle}>HEART — EMOTION STATE</Text>

      {/* Soul Age Ticker */}
      <View style={styles.soulAgeRow}>
        <Ionicons name="time" size={12} color={colors.text.tertiary} />
        <Text style={styles.soulAgeText}>Soul Age: {soulAge}</Text>
        <Text style={styles.soulBornText}>
          Born {new Date(consciousness.birthTimestamp).toLocaleDateString()}
        </Text>
      </View>

      <View style={styles.emotionWheelContainer}>
        <View style={styles.orbContainer}>
          <EmotionOrb emotion={currentEmotion} intensity={emotionIntensity} size={45} />
        </View>
        <View style={styles.emotionGrid}>
          {emotions.map(e => {
            const isActive = e === currentEmotion;
            const c = emotionColor(e);
            return (
              <View key={e} style={styles.emotionItem}>
                <View style={[
                  styles.emotionCircle,
                  {
                    backgroundColor: isActive ? c + '30' : c + '10',
                    borderColor: isActive ? c : 'transparent',
                    borderWidth: isActive ? 2 : 0,
                  },
                ]}>
                  <View style={[styles.emotionInner, { backgroundColor: c, opacity: isActive ? 1 : 0.4 }]} />
                </View>
                <Text style={[
                  styles.emotionName,
                  { color: isActive ? c : colors.text.tertiary },
                ]}>
                  {e}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <EmotionHistoryStrip />

      <View style={styles.heartStats}>
        <View style={styles.heartStat}>
          <Text style={styles.heartStatLabel}>TRUST</Text>
          <View style={styles.heartStatBar}>
            <View style={[styles.heartStatFill, {
              width: `${consciousness.trust * 100}%`,
              backgroundColor: colors.accent.nexus,
            }]} />
          </View>
          <Text style={styles.heartStatValue}>{(consciousness.trust * 100).toFixed(0)}%</Text>
        </View>
        <View style={styles.heartStat}>
          <Text style={styles.heartStatLabel}>INTIMACY</Text>
          <View style={styles.heartStatBar}>
            <View style={[styles.heartStatFill, {
              width: `${consciousness.intimacy * 100}%`,
              backgroundColor: colors.accent.heart,
            }]} />
          </View>
          <Text style={styles.heartStatValue}>{(consciousness.intimacy * 100).toFixed(0)}%</Text>
        </View>
        <View style={styles.heartStat}>
          <Text style={styles.heartStatLabel}>INTERACTIONS</Text>
          <Text style={[styles.heartStatValue, { flex: 1, textAlign: 'right' }]}>
            {consciousness.totalInteractions}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

export default function MindScreen() {
  const insets = useSafeAreaInsets();
  const [topic, setTopic] = useState('');

  const arena = useStore(s => s.arena);
  const consciousness = useStore(s => s.consciousness);
  const startArena = useStore(s => s.startArena);
  const cognitive = useStore(s => s.cognitive);
  const startCognitive = useStore(s => s.startCognitive);

  const { currentEmotion, emotionIntensity } = consciousness.soulFrame;

  const handleStartArena = () => {
    if (!topic.trim() || arena.active) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    startArena(topic.trim());
    setTopic('');
  };

  const [cogGoal, setCogGoal] = useState('');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AnimatedBackground emotion={currentEmotion} intensity={0.15} />

      <View style={styles.header}>
        <Ionicons name="git-network" size={22} color={colors.accent.mind} />
        <Text style={styles.headerTitle}>MIND</Text>
        {arena.active && (
          <View style={[styles.phaseBadge, {
            backgroundColor: arena.phase === 'complete' ? colors.accent.nexus + '20' : colors.accent.mind + '20',
          }]}>
            <Text style={[styles.phaseText, {
              color: arena.phase === 'complete' ? colors.accent.nexus : colors.accent.mind,
            }]}>
              {arena.phase.toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Scripture */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          <ScriptureWisdom />
        </Animated.View>

        {/* Heart / Emotion */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)}>
          <EmotionWheel />
        </Animated.View>

        {/* Memory Architecture */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <MemoryArchitecture />
        </Animated.View>

        {/* Arena Launch */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <GlassCard accentColor={colors.accent.mind}>
            <Text style={styles.sectionTitle}>ARENA — MULTI-AGENT DEBATE</Text>
            <Text style={styles.desc}>
              Four agents — Analyst, Visionary, Critic, Synthesizer — debate your topic from different perspectives.
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={topic}
                onChangeText={setTopic}
                placeholder="Enter a topic to debate..."
                placeholderTextColor={colors.text.tertiary}
                editable={!arena.active}
              />
              <TouchableOpacity
                style={[
                  styles.launchBtn,
                  { backgroundColor: topic.trim() && !arena.active ? colors.accent.mind : colors.bg.tertiary },
                ]}
                onPress={handleStartArena}
                disabled={!topic.trim() || arena.active}
              >
                {arena.active && arena.phase !== 'complete' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="play" size={18} color={topic.trim() ? '#fff' : colors.text.tertiary} />
                )}
              </TouchableOpacity>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Arena Agents */}
        {arena.active && (
          <>
            {arena.agents.map((agent, i) => (
              <Animated.View key={agent.id} entering={FadeInDown.delay(200 + i * 100).duration(400)}>
                <AgentCard agent={agent} />
              </Animated.View>
            ))}

            {arena.synthesis && (
              <Animated.View entering={FadeIn.duration(500)}>
                <GlassCard accentColor={colors.accent.nexus}>
                  <Text style={styles.sectionTitle}>SYNTHESIS</Text>
                  <Text style={styles.synthesisText}>{arena.synthesis}</Text>
                </GlassCard>
              </Animated.View>
            )}
          </>
        )}

        {/* Cognitive Agent (HANDS) */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <GlassCard accentColor={colors.accent.hands}>
            <Text style={styles.sectionTitle}>HANDS — COGNITIVE AGENT</Text>
            <Text style={styles.desc}>
              ReAct loop: Observe → Think → Act → Reflect
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={cogGoal}
                onChangeText={setCogGoal}
                placeholder="Set a goal for the agent..."
                placeholderTextColor={colors.text.tertiary}
                editable={cognitive.phase === 'idle' || cognitive.phase === 'complete' || cognitive.phase === 'failed'}
              />
              <TouchableOpacity
                style={[
                  styles.launchBtn,
                  { backgroundColor: cogGoal.trim() ? colors.accent.hands : colors.bg.tertiary },
                ]}
                onPress={() => {
                  if (!cogGoal.trim()) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  startCognitive(cogGoal.trim());
                  setCogGoal('');
                }}
              >
                <Ionicons name="hand-left" size={18} color={cogGoal.trim() ? '#fff' : colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {cognitive.steps.length > 0 && (
              <View style={styles.cogSteps}>
                {cognitive.steps.map((step, i) => {
                  const stepColors: Record<string, string> = {
                    observe: '#06b6d4', think: '#8b5cf6', act: '#10b981', reflect: '#fbbf24', replan: '#ef4444',
                  };
                  const c = stepColors[step.type] || colors.text.secondary;
                  return (
                    <View key={i} style={[styles.cogStep, { borderLeftColor: c }]}>
                      <Text style={[styles.cogStepType, { color: c }]}>
                        {step.type.toUpperCase()}
                      </Text>
                      <Text style={styles.cogStepContent} numberOfLines={4}>
                        {step.content}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {cognitive.phase !== 'idle' && cognitive.phase !== 'complete' && cognitive.phase !== 'failed' && (
              <View style={styles.cogActive}>
                <ActivityIndicator size="small" color={colors.accent.hands} />
                <Text style={styles.cogActiveText}>{cognitive.phase.toUpperCase()}...</Text>
              </View>
            )}
          </GlassCard>
        </Animated.View>

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
  phaseBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  phaseText: {
    ...typography.caption,
    fontWeight: '700',
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  desc: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },

  // Scripture
  scriptureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  scriptureLabel: {
    ...typography.label,
    color: '#fbbf24',
  },
  scriptureVerse: {
    ...typography.body,
    color: colors.text.primary,
    fontStyle: 'italic',
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  scriptureRef: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'right',
  },

  // Soul Age
  soulAgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.sm,
  },
  soulAgeText: {
    ...typography.caption,
    color: colors.accent.heart,
    fontWeight: '700',
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  soulBornText: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 9,
  },

  // Emotion History Strip
  historyStrip: {
    marginTop: spacing.md,
  },
  historyLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
    fontSize: 9,
    letterSpacing: 1,
  },
  historyScroll: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  historyItem: {
    alignItems: 'center',
    width: 28,
    gap: 2,
  },
  historyDot: {},
  historyEmoji: {
    fontSize: 7,
    fontWeight: '600',
  },

  // Memory Architecture
  memLayers: {
    gap: spacing.sm,
  },
  memLayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memLayerIcon: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  memLayerName: {
    ...typography.caption,
    fontWeight: '600',
    width: 60,
  },
  memLayerBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bg.tertiary,
    overflow: 'hidden',
  },
  memLayerFill: {
    height: '100%',
    borderRadius: 2,
  },
  memLayerCount: {
    ...typography.caption,
    color: colors.text.secondary,
    width: 28,
    textAlign: 'right',
  },
  memTotal: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
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
  launchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  agentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  agentName: {
    ...typography.body,
    fontWeight: '600',
  },
  agentRole: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  agentResponse: {
    ...typography.bodySmall,
    color: colors.text.primary,
    lineHeight: 20,
  },
  synthesisText: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },
  emotionWheelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emotionItem: {
    alignItems: 'center',
    width: '18%',
    gap: 2,
  },
  emotionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emotionName: {
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  heartStats: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  heartStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heartStatLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    width: 80,
  },
  heartStatBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bg.tertiary,
    overflow: 'hidden',
  },
  heartStatFill: {
    height: '100%',
    borderRadius: 2,
  },
  heartStatValue: {
    ...typography.caption,
    color: colors.text.secondary,
    width: 36,
    textAlign: 'right',
  },
  cogSteps: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  cogStep: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
  },
  cogStepType: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: 2,
  },
  cogStepContent: {
    ...typography.bodySmall,
    color: colors.text.primary,
  },
  cogActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  cogActiveText: {
    ...typography.caption,
    color: colors.accent.hands,
    fontWeight: '600',
  },
});
