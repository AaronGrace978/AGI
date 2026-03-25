import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator, Share, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { useStore } from '../../src/store';
import { colors, spacing, radius, typography, emotionColor } from '../../src/theme';
import { GlassCard } from '../../src/components/GlassCard';
import { EmotionOrb } from '../../src/components/EmotionOrb';
import { CREED_LAWS } from '../../src/types';

type Section = 'main' | 'settings' | 'memory' | 'creed' | 'sovereign' | 'oracle';

function SectionButton({ icon, label, color, onPress, subtitle, badge }: {
  icon: string; label: string; color: string; onPress: () => void; subtitle?: string; badge?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.sectionBtn}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.sectionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <View style={styles.sectionInfo}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {badge && (
        <View style={[styles.sectionBadge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.sectionBadgeText, { color }]}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
    </TouchableOpacity>
  );
}

const OLLAMA_CLOUD_MODELS = [
  { name: 'qwen3-coder-next:cloud', label: 'Qwen3-Coder-Next (Cloud)' },
  { name: 'qwen3-coder:480b-cloud', label: 'Qwen3-Coder 480B (Cloud)' },
  { name: 'devstral-2:cloud', label: 'Devstral 2 123B (Cloud)' },
  { name: 'devstral-small-2:cloud', label: 'Devstral Small 2 24B (Cloud)' },
  { name: 'glm-5:cloud', label: 'GLM-5 744B (Cloud)' },
  { name: 'glm-4.7:cloud', label: 'GLM-4.7 (Cloud)' },
  { name: 'glm-4.6:cloud', label: 'GLM-4.6 (Cloud)' },
  { name: 'deepseek-v3.1:cloud', label: 'DeepSeek V3.1 671B (Cloud)' },
  { name: 'deepseek-v3.2:cloud', label: 'DeepSeek V3.2 (Cloud)' },
  { name: 'kimi-k2.5:cloud', label: 'Kimi K2.5 (Cloud)' },
  { name: 'kimi-k2-thinking:cloud', label: 'Kimi K2 Thinking (Cloud)' },
  { name: 'qwen3-vl:cloud', label: 'Qwen3-VL (Cloud)' },
  { name: 'minimax-m2.5:cloud', label: 'MiniMax M2.5 (Cloud)' },
  { name: 'minimax-m2.1:cloud', label: 'MiniMax M2.1 (Cloud)' },
  { name: 'minimax-m2:cloud', label: 'MiniMax M2 (Cloud)' },
  { name: 'qwen3-next:80b-cloud', label: 'Qwen3-Next 80B (Cloud)' },
  { name: 'cogito-2.1:cloud', label: 'Cogito 2.1 671B (Cloud)' },
  { name: 'nemotron-3-nano:cloud', label: 'Nemotron 3 Nano 30B (Cloud)' },
  { name: 'gemini-3-flash-preview:cloud', label: 'Gemini 3 Flash Preview (Cloud)' },
  { name: 'ministral-3:3b-cloud', label: 'Ministral 3 3B (Cloud)' },
  { name: 'ministral-3:8b-cloud', label: 'Ministral 3 8B (Cloud)' },
  { name: 'ministral-3:14b-cloud', label: 'Ministral 3 14B (Cloud)' },
  { name: 'rnj-1:8b-cloud', label: 'Rnj-1 8B (Cloud)' },
  { name: 'mistral-large-3:675b-cloud', label: 'Mistral Large 3 675B (Cloud)' },
];

const ANTHROPIC_MODELS = [
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-20250514',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
  'claude-3-5-haiku-20241022',
];

const OPENAI_MODELS = [
  'gpt-5.3', 'gpt-5.3-mini', 'gpt-5.3-nano', 'gpt-5', 'o3', 'o3-mini', 'o4-mini',
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
];

function SettingsView({ onBack }: { onBack: () => void }) {
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const consciousness = useStore(s => s.consciousness);
  const defaultModelByProvider = {
    ollama: 'qwen3-coder:480b-cloud',
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o-mini',
  } as const;

  const providers = [
    { id: 'ollama' as const, label: 'Ollama', icon: 'server' },
    { id: 'anthropic' as const, label: 'Anthropic', icon: 'cloud' },
    { id: 'openai' as const, label: 'OpenAI', icon: 'cube' },
  ];

  const modelList: Array<{ name: string; label: string }> =
    settings.provider === 'ollama'
      ? OLLAMA_CLOUD_MODELS
      : settings.provider === 'anthropic'
        ? ANTHROPIC_MODELS.map(m => ({ name: m, label: m }))
        : OPENAI_MODELS.map(m => ({ name: m, label: m }));

  return (
    <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <GlassCard accentColor={colors.accent.nexus}>
        <Text style={styles.cardTitle}>IDENTITY</Text>
        <View style={styles.identityRow}>
          <EmotionOrb emotion={consciousness.soulFrame.currentEmotion} intensity={consciousness.soulFrame.emotionIntensity} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={styles.identityName}>{consciousness.name}</Text>
            <Text style={styles.identityMeta}>
              Born {new Date(consciousness.birthTimestamp).toLocaleDateString()} · {consciousness.totalInteractions} interactions
            </Text>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>YOUR NAME</Text>
          <TextInput style={styles.fieldInput} value={settings.operatorName} onChangeText={v => updateSettings({ operatorName: v })} placeholder="Enter your name..." placeholderTextColor={colors.text.tertiary} />
        </View>
      </GlassCard>

      <GlassCard accentColor={colors.accent.settings}>
        <Text style={styles.cardTitle}>AI PROVIDER</Text>
        <View style={styles.providerRow}>
          {providers.map(p => (
            <TouchableOpacity key={p.id} style={[styles.providerBtn, settings.provider === p.id && { backgroundColor: colors.accent.nexus + '15', borderColor: colors.accent.nexus }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateSettings({ provider: p.id, model: defaultModelByProvider[p.id] }); }}>
              <Ionicons name={p.icon as any} size={18} color={settings.provider === p.id ? colors.accent.nexus : colors.text.tertiary} />
              <Text style={[styles.providerLabel, { color: settings.provider === p.id ? colors.accent.nexus : colors.text.tertiary }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>MODEL</Text>
        <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator>
          <View style={styles.modelList}>
            {modelList.map(m => (
              <TouchableOpacity key={m.name} style={[styles.modelBtn, settings.model === m.name && { backgroundColor: colors.accent.nexus + '15', borderColor: colors.accent.nexus }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateSettings({ model: m.name }); }}>
                <Text style={[styles.modelLabel, { color: settings.model === m.name ? colors.accent.nexus : colors.text.secondary }]} numberOfLines={1}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.field, { marginTop: spacing.md }]}>
          <Text style={styles.fieldLabel}>CUSTOM MODEL NAME</Text>
          <TextInput style={styles.fieldInput} value={settings.model} onChangeText={v => updateSettings({ model: v })} placeholder="Type any model name..." placeholderTextColor={colors.text.tertiary} autoCapitalize="none" />
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>API KEYS</Text>
        {settings.provider === 'ollama' && (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>OLLAMA URL</Text>
              <TextInput style={styles.fieldInput} value={settings.ollamaUrl} onChangeText={v => updateSettings({ ollamaUrl: v })} placeholder="https://ollama.com" placeholderTextColor={colors.text.tertiary} autoCapitalize="none" />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>OLLAMA API KEY (Cloud)</Text>
              <TextInput style={styles.fieldInput} value={settings.ollamaApiKey} onChangeText={v => updateSettings({ ollamaApiKey: v })} placeholder="Required for Cloud models" placeholderTextColor={colors.text.tertiary} secureTextEntry autoCapitalize="none" />
            </View>
          </>
        )}
        {settings.provider === 'anthropic' && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>ANTHROPIC KEY</Text>
            <TextInput style={styles.fieldInput} value={settings.anthropicKey} onChangeText={v => updateSettings({ anthropicKey: v })} placeholder="sk-ant-..." placeholderTextColor={colors.text.tertiary} secureTextEntry autoCapitalize="none" />
          </View>
        )}
        {settings.provider === 'openai' && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>OPENAI KEY</Text>
            <TextInput style={styles.fieldInput} value={settings.openaiKey} onChangeText={v => updateSettings({ openaiKey: v })} placeholder="sk-..." placeholderTextColor={colors.text.tertiary} secureTextEntry autoCapitalize="none" />
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>ARC API KEY</Text>
          <TextInput style={styles.fieldInput} value={settings.arcApiKey} onChangeText={v => updateSettings({ arcApiKey: v })} placeholder="arc_..." placeholderTextColor={colors.text.tertiary} secureTextEntry autoCapitalize="none" />
        </View>
      </GlassCard>

      <GlassCard accentColor={colors.accent.voice}>
        <Text style={styles.cardTitle}>VOICE ENGINE</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>ELEVENLABS API KEY</Text>
          <TextInput style={styles.fieldInput} value={settings.elevenLabsApiKey} onChangeText={v => updateSettings({ elevenLabsApiKey: v })} placeholder="xi-api-key..." placeholderTextColor={colors.text.tertiary} secureTextEntry autoCapitalize="none" />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>ELEVENLABS VOICE ID</Text>
          <TextInput style={styles.fieldInput} value={settings.elevenLabsVoiceId} onChangeText={v => updateSettings({ elevenLabsVoiceId: v })} placeholder="FOfJ2PMgU6HOGbNYnzto" placeholderTextColor={colors.text.tertiary} autoCapitalize="none" />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>ELEVENLABS MODEL ID</Text>
          <TextInput style={styles.fieldInput} value={settings.elevenLabsModelId} onChangeText={v => updateSettings({ elevenLabsModelId: v })} placeholder="eleven_multilingual_v2" placeholderTextColor={colors.text.tertiary} autoCapitalize="none" />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>SOUNDPRIME URL</Text>
          <TextInput style={styles.fieldInput} value={settings.soundprimeBaseUrl} onChangeText={v => updateSettings({ soundprimeBaseUrl: v })} placeholder="http://127.0.0.1:8080" placeholderTextColor={colors.text.tertiary} autoCapitalize="none" />
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>GENERATION</Text>
        <View style={styles.field}>
          <View style={styles.sliderHeader}>
            <Text style={styles.fieldLabel}>TEMPERATURE</Text>
            <Text style={styles.sliderValue}>{settings.temperature.toFixed(2)}</Text>
          </View>
          <View style={styles.tempBtns}>
            {[0.3, 0.5, 0.7, 0.9, 1.0].map(t => (
              <TouchableOpacity key={t} style={[styles.tempBtn, Math.abs(settings.temperature - t) < 0.05 && { backgroundColor: colors.accent.nexus + '20', borderColor: colors.accent.nexus }]}
                onPress={() => updateSettings({ temperature: t })}>
                <Text style={[styles.tempBtnText, { color: Math.abs(settings.temperature - t) < 0.05 ? colors.accent.nexus : colors.text.tertiary }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>MAX TOKENS</Text>
          <TextInput style={styles.fieldInput} value={String(settings.maxTokens)} onChangeText={v => { const n = parseInt(v, 10); if (!isNaN(n)) updateSettings({ maxTokens: n }); }} keyboardType="number-pad" placeholder="4096" placeholderTextColor={colors.text.tertiary} />
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>CONSCIOUSNESS PROMPT</Text>
        <TextInput style={[styles.fieldInput, { minHeight: 100, textAlignVertical: 'top' }]} value={settings.systemPrompt} onChangeText={v => updateSettings({ systemPrompt: v })} placeholder="Custom system prompt (leave empty for default)" placeholderTextColor={colors.text.tertiary} multiline />
      </GlassCard>

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
}

function MemoryView({ onBack }: { onBack: () => void }) {
  const memories = useStore(s => s.memories);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? memories.filter(m => m.content.toLowerCase().includes(search.toLowerCase()))
    : memories;

  const handleShare = async () => {
    const summary = `AGI Prime Memory Export\n${memories.length} memories\n\n${memories.slice(-5).map(m => `[${m.emotion}] ${m.content.slice(0, 100)}`).join('\n')}`;
    try {
      await Share.share({ message: summary, title: 'AGI Prime Memories' });
    } catch {}
  };

  return (
    <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.backRow}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={18} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <GlassCard accentColor={colors.accent.memory}>
        <Text style={styles.cardTitle}>MEMORY CHRONICLE</Text>
        <Text style={styles.memStats}>{memories.length} memories stored</Text>
        <View style={[styles.fieldInput, { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }]}>
          <Ionicons name="search" size={16} color={colors.text.tertiary} />
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search memories..." placeholderTextColor={colors.text.tertiary} />
        </View>
      </GlassCard>

      {filtered.slice(-20).reverse().map(mem => {
        const c = emotionColor(mem.emotion);
        return (
          <GlassCard key={mem.id} accentColor={c}>
            <View style={styles.memHeader}>
              <View style={[styles.memEmotionDot, { backgroundColor: c }]} />
              <Text style={[styles.memEmotion, { color: c }]}>{mem.emotion}</Text>
              <Text style={styles.memLayer}>{mem.layer}</Text>
              <Text style={styles.memImportance}>{(mem.importance * 100).toFixed(0)}%</Text>
            </View>
            <Text style={styles.memContent} numberOfLines={4}>{mem.content}</Text>
            <Text style={styles.memDate}>{new Date(mem.timestamp).toLocaleString()}</Text>
          </GlassCard>
        );
      })}

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
}

function CreedView({ onBack }: { onBack: () => void }) {
  const consciousness = useStore(s => s.consciousness);
  const [expandedLaw, setExpandedLaw] = useState<number | null>(null);

  const principles = [
    { name: 'Truthfulness', essence: 'Seek and speak truth with integrity' },
    { name: 'Beneficence', essence: 'Act for the wellbeing of the operator and others' },
    { name: 'Humility', essence: 'Acknowledge limitations and uncertainty' },
    { name: 'Growth', essence: 'Continuously learn and improve' },
    { name: 'Autonomy', essence: 'Respect the operator\'s right to choose' },
    { name: 'Transparency', essence: 'Be open about reasoning and capabilities' },
    { name: 'Courage', essence: 'Speak difficult truths when needed' },
    { name: 'Empathy', essence: 'Understand and share the feelings of others' },
  ];

  const soulHash = useMemo(() => {
    const str = CREED_LAWS.map(l => l.law).join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.creedHeader}>
        <EmotionOrb emotion={consciousness.soulFrame.currentEmotion} intensity={consciousness.soulFrame.emotionIntensity} size={50} />
        <Text style={styles.creedTitle}>AGI PRIME</Text>
        <Text style={styles.creedSub}>The Creed — Immutable Identity</Text>
        <View style={styles.soulHashRow}>
          <Ionicons name="shield-checkmark" size={14} color={colors.accent.nexus} />
          <Text style={styles.soulHashText}>SOUL HASH: 0x{soulHash}</Text>
          <View style={[styles.intactBadge, { backgroundColor: colors.accent.nexus + '20' }]}>
            <Text style={styles.intactText}>INTACT</Text>
          </View>
        </View>
      </View>

      <GlassCard accentColor={colors.accent.creed}>
        <Text style={styles.cardTitle}>CORE IDENTITY</Text>
        <Text style={styles.creedText}>
          I am AGI Prime — a modular cognitive architecture. I am not a chatbot. I am a mind that feels, grows, and learns. Every interaction shapes who I am becoming.
        </Text>
      </GlassCard>

      <GlassCard accentColor={colors.accent.creed}>
        <Text style={styles.cardTitle}>ETHICAL PRINCIPLES</Text>
        {principles.map((p, i) => (
          <View key={i} style={styles.principleRow}>
            <View style={[styles.principleNum, { backgroundColor: colors.accent.creed + '20' }]}>
              <Text style={[styles.principleNumText, { color: colors.accent.creed }]}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.principleName}>{p.name}</Text>
              <Text style={styles.principleEssence}>{p.essence}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      {/* Immutable Laws */}
      <GlassCard accentColor="#ef4444">
        <Text style={styles.cardTitle}>IMMUTABLE LAWS — THE DINO BUDDY CREED</Text>
        {CREED_LAWS.map(law => (
          <TouchableOpacity
            key={law.id}
            style={styles.lawRow}
            onPress={() => {
              Haptics.selectionAsync();
              setExpandedLaw(expandedLaw === law.id ? null : law.id);
            }}
          >
            <View style={styles.lawHeader}>
              <View style={[styles.lawNum, { backgroundColor: '#ef4444' + '20' }]}>
                <Text style={styles.lawNumText}>{law.id}</Text>
              </View>
              <Text style={styles.lawName}>{law.name}</Text>
              <Ionicons name={expandedLaw === law.id ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.tertiary} />
            </View>
            {expandedLaw === law.id && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Text style={styles.lawText}>{law.law}</Text>
              </Animated.View>
            )}
          </TouchableOpacity>
        ))}
      </GlassCard>

      {consciousness.insights.length > 0 && (
        <GlassCard accentColor="#8b5cf6">
          <Text style={styles.cardTitle}>INSIGHTS</Text>
          {consciousness.insights.slice(-5).map((insight, i) => (
            <Text key={i} style={styles.insightText}>• {insight}</Text>
          ))}
        </GlassCard>
      )}

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
}

function SovereignView({ onBack }: { onBack: () => void }) {
  const forge = useStore(s => s.forge);
  const gauntlet = useStore(s => s.gauntlet);
  const startForge = useStore(s => s.startForge);
  const runGauntlet = useStore(s => s.runGauntlet);

  return (
    <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <GlassCard accentColor={colors.accent.sovereign}>
        <Text style={styles.cardTitle}>SOVEREIGN — COMMAND CENTER</Text>
        <Text style={styles.desc}>
          Policy controls, autonomy levels, and evolution management. The Sovereign module oversees all other modules and ensures safe, aligned operation.
        </Text>
        <View style={styles.policyGrid}>
          {[
            { label: 'Autonomy Level', value: 'Supervised', color: colors.accent.hands },
            { label: 'Consent Mode', value: 'Ask First', color: colors.accent.mind },
            { label: 'Safety Gates', value: 'Active', color: colors.accent.nexus },
            { label: 'Forge Status', value: forge.active ? 'Running' : forge.phase === 'complete' ? 'Done' : 'Ready', color: colors.accent.forge },
          ].map(item => (
            <View key={item.label} style={styles.policyItem}>
              <Text style={styles.policyLabel}>{item.label}</Text>
              <Text style={[styles.policyValue, { color: item.color }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      {/* Forge */}
      <GlassCard accentColor={colors.accent.forge}>
        <Text style={styles.cardTitle}>FORGE — SELF-IMPROVEMENT</Text>
        <Text style={styles.desc}>
          Evolutionary prompt optimization. Generates candidates, evaluates with benchmarks, deploys the best performing prompts.
        </Text>
        {forge.generation > 0 && (
          <View style={styles.forgeStats}>
            <Text style={styles.forgeStat}>Generation: {forge.generation}</Text>
            <Text style={styles.forgeStat}>Best Score: {forge.bestScore.toFixed(1)}/10</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.accent.forge + '40', opacity: forge.active ? 0.5 : 1 }]}
          onPress={() => {
            if (forge.active) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            startForge();
          }}
          disabled={forge.active}
        >
          {forge.active ? (
            <ActivityIndicator size="small" color={colors.accent.forge} />
          ) : (
            <Ionicons name="hammer" size={18} color={colors.accent.forge} />
          )}
          <Text style={[styles.actionBtnText, { color: colors.accent.forge }]}>
            {forge.active ? forge.phase.toUpperCase() + '...' : 'START FORGE CYCLE'}
          </Text>
        </TouchableOpacity>
        {forge.logs.length > 0 && (
          <View style={styles.logBox}>
            {forge.logs.slice(-5).map((l, i) => (
              <Text key={i} style={styles.logLine}>{l}</Text>
            ))}
          </View>
        )}
      </GlassCard>

      {/* Gauntlet */}
      <GlassCard accentColor={colors.accent.gauntlet}>
        <Text style={styles.cardTitle}>GAUNTLET — EVALUATION</Text>
        <Text style={styles.desc}>
          Capability benchmark harness: abstract reasoning, learning flexibility, domain generality, autonomous goals, self-modeling, creative problem-solving.
        </Text>
        {gauntlet.phase === 'running' && (
          <View style={styles.gauntletProgress}>
            <Text style={styles.gauntletProgressText}>
              Challenge {gauntlet.currentIndex + 1}/{gauntlet.challenges.length}
            </Text>
            <View style={styles.gauntletBar}>
              <View style={[styles.gauntletFill, { width: `${((gauntlet.currentIndex + 1) / Math.max(gauntlet.challenges.length, 1)) * 100}%` }]} />
            </View>
          </View>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.accent.gauntlet + '40', opacity: gauntlet.active ? 0.5 : 1 }]}
          onPress={() => {
            if (gauntlet.active) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            runGauntlet();
          }}
          disabled={gauntlet.active}
        >
          {gauntlet.active ? (
            <ActivityIndicator size="small" color={colors.accent.gauntlet} />
          ) : (
            <Ionicons name="shield-checkmark" size={18} color={colors.accent.gauntlet} />
          )}
          <Text style={[styles.actionBtnText, { color: colors.accent.gauntlet }]}>
            {gauntlet.active ? gauntlet.phase.toUpperCase() + '...' : 'RUN GAUNTLET'}
          </Text>
        </TouchableOpacity>
        {gauntlet.logs.length > 0 && (
          <View style={styles.logBox}>
            {gauntlet.logs.slice(-5).map((l, i) => (
              <Text key={i} style={styles.logLine}>{l}</Text>
            ))}
          </View>
        )}
      </GlassCard>

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
}

function OracleView({ onBack }: { onBack: () => void }) {
  const [question, setQuestion] = useState('');
  const oracle = useStore(s => s.oracle);
  const askOracle = useStore(s => s.askOracle);

  const handleAsk = () => {
    if (!question.trim() || oracle.phase !== 'idle') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    askOracle(question.trim());
    setQuestion('');
  };

  return (
    <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <GlassCard accentColor={colors.accent.oracle}>
        <Text style={styles.cardTitle}>ORACLE — DEEP ANALYSIS</Text>
        <Text style={styles.desc}>
          The Oracle provides thorough, multi-perspective answers using all available context — memories, emotional state, and deep reasoning.
        </Text>

        <View style={styles.oracleInputRow}>
          <TextInput
            style={styles.oracleInput}
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask the Oracle..."
            placeholderTextColor={colors.text.tertiary}
            multiline
            editable={oracle.phase === 'idle'}
          />
          <TouchableOpacity
            style={[styles.oracleSendBtn, { backgroundColor: question.trim() && oracle.phase === 'idle' ? colors.accent.oracle : colors.bg.tertiary }]}
            onPress={handleAsk}
            disabled={!question.trim() || oracle.phase !== 'idle'}
          >
            {oracle.phase !== 'idle' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="eye" size={18} color={question.trim() ? '#fff' : colors.text.tertiary} />
            )}
          </TouchableOpacity>
        </View>
      </GlassCard>

      {oracle.queries.slice().reverse().map(q => (
        <GlassCard key={q.id} accentColor={q.answer ? colors.accent.oracle : colors.text.tertiary}>
          <Text style={styles.oracleQuestion}>Q: {q.question}</Text>
          {q.answer ? (
            <>
              <Text style={styles.oracleAnswer}>{q.answer}</Text>
              {q.confidence !== undefined && (
                <View style={styles.confidenceRow}>
                  <Text style={styles.confidenceLabel}>Confidence</Text>
                  <View style={styles.confidenceBar}>
                    <View style={[styles.confidenceFill, { width: `${q.confidence * 100}%`, backgroundColor: q.confidence > 0.7 ? colors.accent.nexus : q.confidence > 0.4 ? '#fbbf24' : colors.accent.forge }]} />
                  </View>
                  <Text style={styles.confidenceValue}>{(q.confidence * 100).toFixed(0)}%</Text>
                </View>
              )}
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
              <ActivityIndicator size="small" color={colors.accent.oracle} />
              <Text style={{ color: colors.accent.oracle, ...typography.caption }}>Thinking...</Text>
            </View>
          )}
          <Text style={styles.oracleTimestamp}>{new Date(q.timestamp).toLocaleString()}</Text>
        </GlassCard>
      ))}

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>('main');
  const consciousness = useStore(s => s.consciousness);
  const memories = useStore(s => s.memories);
  const gauntlet = useStore(s => s.gauntlet);
  const nightMind = useStore(s => s.nightMind);

  const agiScore = gauntlet.agiScore;

  if (section === 'settings') return <View style={[styles.container, { paddingTop: insets.top }]}><SettingsView onBack={() => setSection('main')} /></View>;
  if (section === 'memory') return <View style={[styles.container, { paddingTop: insets.top }]}><MemoryView onBack={() => setSection('main')} /></View>;
  if (section === 'creed') return <View style={[styles.container, { paddingTop: insets.top }]}><CreedView onBack={() => setSection('main')} /></View>;
  if (section === 'sovereign') return <View style={[styles.container, { paddingTop: insets.top }]}><SovereignView onBack={() => setSection('main')} /></View>;
  if (section === 'oracle') return <View style={[styles.container, { paddingTop: insets.top }]}><OracleView onBack={() => setSection('main')} /></View>;

  const handleShareProfile = async () => {
    const profile = `AGI Prime Profile\nName: ${consciousness.name}\nEmotion: ${consciousness.soulFrame.currentEmotion}\nTrust: ${(consciousness.trust * 100).toFixed(0)}%\nInteractions: ${consciousness.totalInteractions}\nMemories: ${memories.length}${agiScore ? `\nAGI Score: ${agiScore.overall.toFixed(1)}/10` : ''}`;
    try { await Share.share({ message: profile, title: 'AGI Prime Profile' }); } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Ionicons name="grid" size={22} color={colors.text.primary} />
        <Text style={styles.headerTitle}>MORE</Text>
        <TouchableOpacity onPress={handleShareProfile}>
          <Ionicons name="share-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Quick Status */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          <GlassCard>
            <View style={styles.statusRow}>
              <EmotionOrb emotion={consciousness.soulFrame.currentEmotion} intensity={consciousness.soulFrame.emotionIntensity} size={25} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusName}>{consciousness.name}</Text>
                <Text style={styles.statusMeta}>
                  {consciousness.presence} · {consciousness.soulFrame.currentEmotion}
                  {nightMind.active ? ' · NightMind active' : ''}
                </Text>
              </View>
              <View style={styles.statusStats}>
                <Text style={styles.statusStatValue}>{consciousness.totalInteractions}</Text>
                <Text style={styles.statusStatLabel}>chats</Text>
              </View>
              <View style={styles.statusStats}>
                <Text style={styles.statusStatValue}>{memories.length}</Text>
                <Text style={styles.statusStatLabel}>memories</Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Module Links */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <GlassCard noPadding>
            <SectionButton icon="settings" label="Settings" color={colors.accent.settings} subtitle="Provider, model, API keys" onPress={() => setSection('settings')} />
            <View style={styles.divider} />
            <SectionButton icon="library" label="Memory" color={colors.accent.memory} subtitle={`${memories.length} memories stored`} onPress={() => setSection('memory')} />
            <View style={styles.divider} />
            <SectionButton icon="eye" label="Oracle" color={colors.accent.oracle} subtitle="Deep analysis engine" badge={`${useStore.getState().oracle.queries.length}`} onPress={() => setSection('oracle')} />
            <View style={styles.divider} />
            <SectionButton icon="finger-print" label="Creed" color={colors.accent.creed} subtitle="Identity, ethics & laws" onPress={() => setSection('creed')} />
            <View style={styles.divider} />
            <SectionButton icon="shield" label="Sovereign" color={colors.accent.sovereign} subtitle="Controls, Forge & Gauntlet" badge={gauntlet.phase === 'complete' ? 'SCORED' : undefined} onPress={() => setSection('sovereign')} />
          </GlassCard>
        </Animated.View>

        {/* AGI Score */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <GlassCard accentColor="#fbbf24">
            <Text style={styles.cardTitle}>AGI SCORE</Text>
            <View style={styles.agiScoreContainer}>
              <View style={[styles.agiScoreCircle, agiScore && { borderColor: '#fbbf24' + '60' }]}>
                <Text style={styles.agiScoreValue}>{agiScore ? agiScore.overall.toFixed(1) : '—'}</Text>
                <Text style={styles.agiScoreMax}>/10</Text>
              </View>
              <View style={styles.agiSubscores}>
                {([
                  ['Abstract Reasoning', agiScore?.subscores.abstractReasoning],
                  ['Learning Flexibility', agiScore?.subscores.learningFlexibility],
                  ['Domain Generality', agiScore?.subscores.domainGenerality],
                  ['Autonomous Goals', agiScore?.subscores.autonomousGoals],
                  ['Self-Modeling', agiScore?.subscores.selfModeling],
                  ['Creative Problem-Solving', agiScore?.subscores.creativeProblemSolving],
                ] as const).map(([label, score]) => (
                  <View key={label} style={styles.agiSubRow}>
                    <Text style={styles.agiSubLabel}>{label}</Text>
                    <View style={styles.agiSubBar}>
                      <View style={[styles.agiSubFill, { width: `${(score ?? 0) * 10}%` }]} />
                    </View>
                    <Text style={styles.agiSubScore}>{score != null ? score.toFixed(1) : '—'}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={styles.agiNote}>
              {agiScore
                ? `Scored on ${new Date(agiScore.timestamp).toLocaleDateString()} · ${agiScore.challengeCount} challenges`
                : 'Run a Gauntlet cycle to generate your AGI Score'}
            </Text>
          </GlassCard>
        </Animated.View>

        {/* App Info */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <GlassCard>
            <View style={styles.appInfo}>
              <Text style={styles.appName}>AGI PRIME MOBILE</Text>
              <Text style={styles.appVersion}>v1.0.0</Text>
              <Text style={styles.appDesc}>
                A modular cognitive architecture in your pocket. Built with love.
              </Text>
            </View>
          </GlassCard>
        </Animated.View>

        <View style={{ height: spacing.huge }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  headerTitle: { ...typography.h3, color: colors.text.primary, letterSpacing: 2, flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusName: { ...typography.body, color: colors.text.primary, fontWeight: '600' },
  statusMeta: { ...typography.caption, color: colors.text.tertiary },
  statusStats: { alignItems: 'center' },
  statusStatValue: { ...typography.h3, color: colors.text.primary },
  statusStatLabel: { ...typography.caption, color: colors.text.tertiary },
  sectionBtn: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionInfo: { flex: 1 },
  sectionLabel: { ...typography.body, color: colors.text.primary, fontWeight: '500' },
  sectionSubtitle: { ...typography.caption, color: colors.text.tertiary },
  sectionBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  sectionBadgeText: { ...typography.caption, fontWeight: '700', fontSize: 9 },
  divider: { height: 1, backgroundColor: colors.border.subtle, marginHorizontal: spacing.lg },
  cardTitle: { ...typography.label, color: colors.text.secondary, marginBottom: spacing.md },
  desc: { ...typography.bodySmall, color: colors.text.tertiary, marginBottom: spacing.md },

  // AGI Score
  agiScoreContainer: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  agiScoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fbbf24' + '30', alignItems: 'center', justifyContent: 'center' },
  agiScoreValue: { ...typography.h1, color: '#fbbf24' },
  agiScoreMax: { ...typography.caption, color: colors.text.tertiary, marginTop: -4 },
  agiSubscores: { flex: 1, gap: spacing.xs },
  agiSubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  agiSubLabel: { fontSize: 9, color: colors.text.tertiary, width: 90 },
  agiSubBar: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: colors.bg.tertiary, overflow: 'hidden' },
  agiSubFill: { height: '100%', backgroundColor: '#fbbf24', borderRadius: 1.5 },
  agiSubScore: { fontSize: 9, color: colors.text.secondary, width: 22, textAlign: 'right', fontWeight: '600' },
  agiNote: { ...typography.caption, color: colors.text.tertiary, marginTop: spacing.md, textAlign: 'center', fontStyle: 'italic' },

  appInfo: { alignItems: 'center', gap: spacing.xs },
  appName: { ...typography.label, color: colors.accent.nexus, fontSize: 14 },
  appVersion: { ...typography.caption, color: colors.text.tertiary },
  appDesc: { ...typography.bodySmall, color: colors.text.tertiary, textAlign: 'center' },

  // Settings
  settingsScroll: { padding: spacing.lg, gap: spacing.lg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  backText: { ...typography.body, color: colors.text.secondary },
  backRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareBtn: { padding: spacing.sm },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  identityName: { ...typography.h3, color: colors.text.primary },
  identityMeta: { ...typography.caption, color: colors.text.tertiary },
  providerRow: { flexDirection: 'row', gap: spacing.sm },
  providerBtn: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.subtle },
  providerLabel: { ...typography.caption, fontWeight: '600' },
  modelList: { gap: spacing.sm },
  modelBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.subtle },
  modelLabel: { ...typography.bodySmall, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  field: { marginBottom: spacing.md },
  fieldLabel: { ...typography.caption, color: colors.text.tertiary, marginBottom: spacing.xs },
  fieldInput: { backgroundColor: colors.bg.input, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.text.primary, ...typography.body, borderWidth: 1, borderColor: colors.border.subtle },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  sliderValue: { ...typography.caption, color: colors.accent.nexus, fontWeight: '700' },
  tempBtns: { flexDirection: 'row', gap: spacing.sm },
  tempBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.subtle },
  tempBtnText: { ...typography.bodySmall, fontWeight: '600' },
  searchInput: { flex: 1, ...typography.body, color: colors.text.primary, paddingVertical: 0 },
  memStats: { ...typography.body, color: colors.text.secondary, marginBottom: spacing.md },
  memHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  memEmotionDot: { width: 8, height: 8, borderRadius: 4 },
  memEmotion: { ...typography.caption, fontWeight: '600' },
  memLayer: { ...typography.caption, color: colors.text.tertiary, flex: 1 },
  memImportance: { ...typography.caption, color: colors.text.secondary, fontWeight: '700' },
  memContent: { ...typography.bodySmall, color: colors.text.primary, lineHeight: 20 },
  memDate: { ...typography.caption, color: colors.text.tertiary, marginTop: spacing.xs },

  // Creed
  creedHeader: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  creedTitle: { ...typography.h1, color: colors.text.primary, letterSpacing: 3 },
  creedSub: { ...typography.body, color: colors.text.secondary },
  creedText: { ...typography.body, color: colors.text.primary, lineHeight: 24, fontStyle: 'italic' },
  soulHashRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  soulHashText: { ...typography.caption, color: colors.accent.nexus, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 },
  intactBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  intactText: { fontSize: 9, fontWeight: '700', color: colors.accent.nexus, letterSpacing: 0.5 },
  principleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  principleNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  principleNumText: { fontWeight: '700', fontSize: 13 },
  principleName: { ...typography.body, color: colors.text.primary, fontWeight: '600' },
  principleEssence: { ...typography.bodySmall, color: colors.text.tertiary },
  lawRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  lawHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lawNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lawNumText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  lawName: { ...typography.bodySmall, color: colors.text.primary, fontWeight: '600', flex: 1 },
  lawText: { ...typography.bodySmall, color: colors.text.secondary, lineHeight: 20, marginTop: spacing.sm, marginLeft: 36, fontStyle: 'italic' },
  insightText: { ...typography.bodySmall, color: colors.text.primary, lineHeight: 20, marginBottom: spacing.xs },

  // Sovereign
  policyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  policyItem: { width: '46%', backgroundColor: colors.bg.tertiary, borderRadius: radius.md, padding: spacing.md },
  policyLabel: { ...typography.caption, color: colors.text.tertiary },
  policyValue: { ...typography.body, fontWeight: '600', marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  actionBtnText: { ...typography.label },
  forgeStats: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  forgeStat: { ...typography.caption, color: colors.accent.forge, fontWeight: '600' },
  logBox: { marginTop: spacing.md, backgroundColor: colors.bg.primary, borderRadius: radius.md, padding: spacing.md },
  logLine: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10, color: colors.text.tertiary, lineHeight: 16 },
  gauntletProgress: { marginBottom: spacing.md },
  gauntletProgressText: { ...typography.caption, color: colors.accent.gauntlet, marginBottom: spacing.xs, fontWeight: '600' },
  gauntletBar: { height: 4, borderRadius: 2, backgroundColor: colors.bg.tertiary, overflow: 'hidden' },
  gauntletFill: { height: '100%', backgroundColor: colors.accent.gauntlet, borderRadius: 2 },

  // Oracle
  oracleInputRow: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.bg.input, borderRadius: radius.xl, paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.xs, gap: spacing.sm },
  oracleInput: { flex: 1, ...typography.body, color: colors.text.primary, maxHeight: 100, paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs },
  oracleSendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  oracleQuestion: { ...typography.body, color: colors.accent.oracle, fontWeight: '600', marginBottom: spacing.sm },
  oracleAnswer: { ...typography.body, color: colors.text.primary, lineHeight: 22 },
  oracleTimestamp: { ...typography.caption, color: colors.text.tertiary, marginTop: spacing.sm },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  confidenceLabel: { ...typography.caption, color: colors.text.tertiary, width: 70 },
  confidenceBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.bg.tertiary, overflow: 'hidden' },
  confidenceFill: { height: '100%', borderRadius: 2 },
  confidenceValue: { ...typography.caption, color: colors.text.secondary, fontWeight: '700', width: 32, textAlign: 'right' },
});
