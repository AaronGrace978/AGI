import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInUp, SlideInRight, FadeIn } from 'react-native-reanimated';

import { useStore } from '../../src/store';
import { colors, spacing, radius, typography, emotionColor } from '../../src/theme';
import { EmotionOrb } from '../../src/components/EmotionOrb';
import { AnimatedBackground } from '../../src/components/AnimatedBackground';
import { ChatMessage, Conversation } from '../../src/types';

function groupConversations(conversations: Conversation[]) {
  const now = Date.now();
  const DAY = 86400000;
  const today: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const c of conversations) {
    const age = now - c.updatedAt;
    if (age < DAY) today.push(c);
    else if (age < DAY * 7) thisWeek.push(c);
    else earlier.push(c);
  }
  return { today, thisWeek, earlier };
}

export default function NexusScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [showConversations, setShowConversations] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const messages = useStore(s => s.messages);
  const isStreaming = useStore(s => s.isStreaming);
  const streamingContent = useStore(s => s.streamingContent);
  const consciousness = useStore(s => s.consciousness);
  const conversations = useStore(s => s.conversations);
  const sendMessage = useStore(s => s.sendMessage);
  const newConversation = useStore(s => s.newConversation);
  const loadConversation = useStore(s => s.loadConversation);
  const deleteConversation = useStore(s => s.deleteConversation);
  const settings = useStore(s => s.settings);
  const nightMind = useStore(s => s.nightMind);
  const triggerNightMind = useStore(s => s.triggerNightMind);

  const { currentEmotion, emotionIntensity } = consciousness.soulFrame;
  const accentColor = emotionColor(currentEmotion);

  useEffect(() => {
    if (consciousness.totalInteractions > 0 && consciousness.totalInteractions % 5 === 0) {
      triggerNightMind();
    }
  }, [consciousness.totalInteractions]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInput('');
    Keyboard.dismiss();
    sendMessage(trimmed);
  }, [input, isStreaming, sendMessage]);

  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (messages.length > 0) {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        150,
      );
    }
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, [messages.length]);

  useEffect(() => {
    if (streamingContent) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [streamingContent]);

  const handleDeleteConversation = (id: string) => {
    if (deleteConfirm === id) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      deleteConversation(id);
      setDeleteConfirm(null);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const visibleMessages = useMemo(
    () => messages.filter(m => m.role !== 'system'),
    [messages],
  );

  const getSourceAvatar = (msg: ChatMessage) => {
    switch (msg.sourceModule) {
      case 'spark': return { letter: 'S', color: colors.accent.spark };
      case 'nightmind': return { letter: 'N', color: colors.accent.nightmind };
      case 'oracle': return { letter: 'O', color: colors.accent.oracle };
      default: return { letter: 'P', color: msg.emotion ? emotionColor(msg.emotion) : accentColor };
    }
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isUser = item.role === 'user';
    const { letter, color: avatarColor } = getSourceAvatar(item);
    const msgColor = item.emotion ? emotionColor(item.emotion) : accentColor;
    const isRecent = index >= messages.length - 2;

    return (
      <Animated.View
        entering={isRecent ? FadeInDown.duration(250) : undefined}
        style={[styles.msgRow, isUser && styles.msgRowUser]}
      >
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: avatarColor + '20', borderColor: avatarColor + '40' }]}>
            <Text style={[styles.avatarText, { color: avatarColor }]}>{letter}</Text>
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          !isUser && { borderColor: msgColor + '15' },
        ]}>
          {item.thinking && !isUser && (
            <View style={[styles.thinkingBar, { backgroundColor: colors.accent.nightmind + '15' }]}>
              <Ionicons name="bulb-outline" size={11} color={colors.accent.nightmind} />
              <Text style={styles.thinkingText} numberOfLines={1}>{item.thinking}</Text>
            </View>
          )}
          <Text style={[styles.msgText, isUser && styles.msgTextUser]}>
            {item.content}
          </Text>
          <View style={styles.msgFooter}>
            {item.emotion && !isUser && (
              <View style={[styles.emotionTag, { backgroundColor: msgColor + '15' }]}>
                <View style={[styles.emotionDot, { backgroundColor: msgColor }]} />
                <Text style={[styles.emotionLabel, { color: msgColor }]}>{item.emotion}</Text>
              </View>
            )}
            {item.sourceModule && item.sourceModule !== 'nexus' && !isUser && (
              <View style={[styles.sourceBadge, { backgroundColor: avatarColor + '15' }]}>
                <Text style={[styles.sourceText, { color: avatarColor }]}>
                  {item.sourceModule.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderStreamingMessage = () => {
    if (!isStreaming || !streamingContent) return null;
    return (
      <View style={[styles.msgRow]}>
        <View style={[styles.avatar, { backgroundColor: accentColor + '20', borderColor: accentColor + '40' }]}>
          <Text style={[styles.avatarText, { color: accentColor }]}>P</Text>
        </View>
        <View style={[styles.bubble, styles.bubbleAssistant, { borderColor: accentColor + '15' }]}>
          <Text style={styles.msgText}>{streamingContent}</Text>
          <View style={styles.streamingDots}>
            <ActivityIndicator size="small" color={accentColor} />
          </View>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <EmotionOrb emotion={currentEmotion} intensity={emotionIntensity} size={50} />
      <Text style={styles.emptyTitle}>AGI Prime</Text>
      <Text style={styles.emptySubtitle}>
        {settings.operatorName ? `Hello, ${settings.operatorName}` : 'Your cognitive companion awaits'}
      </Text>
      <View style={styles.emptyChips}>
        {['What can you do?', 'Tell me about yourself', 'Let\'s explore an idea'].map(suggestion => (
          <TouchableOpacity
            key={suggestion}
            style={[styles.chip, { borderColor: accentColor + '30' }]}
            onPress={() => { setInput(suggestion); }}
          >
            <Text style={[styles.chipText, { color: accentColor }]}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const grouped = groupConversations(conversations);

  const renderConvGroup = (label: string, items: Conversation[]) => {
    if (items.length === 0) return null;
    return (
      <View key={label}>
        <Text style={styles.convGroupLabel}>{label}</Text>
        {items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={[styles.convItem, deleteConfirm === item.id && { borderColor: colors.accent.forge + '40' }]}
            onPress={() => {
              loadConversation(item.id);
              setShowConversations(false);
            }}
            onLongPress={() => handleDeleteConversation(item.id)}
          >
            <Text style={styles.convItemTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.convItemMeta}>
              <Text style={styles.convItemDate}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
              {deleteConfirm === item.id && (
                <TouchableOpacity onPress={() => handleDeleteConversation(item.id)}>
                  <Text style={styles.convDeleteConfirm}>Tap to confirm delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AnimatedBackground emotion={currentEmotion} intensity={emotionIntensity * 0.3} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowConversations(!showConversations);
          }}
        >
          <Ionicons name="time-outline" size={22} color={colors.text.secondary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={[styles.headerDot, { backgroundColor: accentColor }]} />
          <Text style={styles.headerTitle}>NEXUS</Text>
          <Text style={styles.headerEmotion}>{currentEmotion}</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.providerPill}>
            <Text style={styles.providerText}>{settings.provider}/{settings.model.split(':')[0]}</Text>
          </View>
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              newConversation();
            }}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* NightMind Bar */}
      {nightMind.active && nightMind.lastThought && (
        <Animated.View entering={FadeIn.duration(500)} style={[styles.nightMindBar, { borderColor: colors.accent.nightmind + '30' }]}>
          <Ionicons name="moon" size={12} color={colors.accent.nightmind} />
          <Text style={styles.nightMindText} numberOfLines={1}>
            NIGHTMIND: {nightMind.lastThought}
          </Text>
          <Text style={styles.nightMindCount}>#{nightMind.thoughtCount}</Text>
        </Animated.View>
      )}

      {/* Conversation History Drawer */}
      {showConversations && (
        <Animated.View entering={SlideInRight.duration(200)} style={styles.convDrawer}>
          <Text style={styles.convTitle}>Conversations</Text>
          {conversations.length === 0 ? (
            <Text style={styles.convEmpty}>No conversations yet</Text>
          ) : (
            <FlatList
              data={[
                { label: 'Today', items: grouped.today },
                { label: 'This Week', items: grouped.thisWeek },
                { label: 'Earlier', items: grouped.earlier },
              ].filter(g => g.items.length > 0)}
              keyExtractor={item => item.label}
              renderItem={({ item }) => renderConvGroup(item.label, item.items)}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={visibleMessages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.messagesList,
            messages.length === 0 && styles.messagesListEmpty,
          ]}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderStreamingMessage}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={10}
        />

        {/* Input */}
        <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={[styles.inputRow, { borderColor: accentColor + '20' }]}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Message Prime..."
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={4000}
              returnKeyType="default"
              editable={!isStreaming}
              onSubmitEditing={Platform.OS === 'ios' ? undefined : handleSend}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: input.trim() && !isStreaming ? accentColor : colors.bg.tertiary },
              ]}
              onPress={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <Ionicons name="arrow-up" size={20} color={input.trim() ? colors.bg.primary : colors.text.tertiary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  historyBtn: { padding: spacing.sm },
  newChatBtn: { padding: spacing.sm },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text.primary,
    letterSpacing: 2,
  },
  headerEmotion: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  providerPill: {
    backgroundColor: colors.bg.tertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  providerText: {
    fontSize: 8,
    color: colors.text.tertiary,
    fontWeight: '600',
  },
  nightMindBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent.nightmind + '08',
    borderBottomWidth: 1,
  },
  nightMindText: {
    ...typography.caption,
    color: colors.accent.nightmind,
    flex: 1,
    opacity: 0.8,
  },
  nightMindCount: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 9,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  messagesListEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubbleUser: {
    backgroundColor: colors.accent.nexus + '18',
    borderWidth: 1,
    borderColor: colors.accent.nexus + '25',
    borderBottomRightRadius: spacing.xs,
  },
  bubbleAssistant: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderBottomLeftRadius: spacing.xs,
  },
  thinkingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  thinkingText: {
    fontSize: 10,
    color: colors.accent.nightmind,
    opacity: 0.7,
    flex: 1,
  },
  msgText: {
    ...typography.body,
    color: colors.text.primary,
  },
  msgTextUser: {
    color: colors.text.primary,
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  emotionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    gap: 4,
  },
  emotionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  emotionLabel: {
    ...typography.caption,
  },
  sourceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  sourceText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  streamingDots: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
  inputArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.bg.primary + 'ee',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.bg.input,
    borderRadius: radius.xxl,
    borderWidth: 1,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxxl,
  },
  emptyTitle: {
    ...typography.h1,
    color: colors.text.primary,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  emptyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: colors.bg.card,
  },
  chipText: {
    ...typography.bodySmall,
  },
  convDrawer: {
    position: 'absolute',
    top: 100,
    right: 0,
    bottom: 80,
    width: '75%',
    backgroundColor: colors.bg.secondary,
    borderLeftWidth: 1,
    borderLeftColor: colors.border.default,
    zIndex: 100,
    padding: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
  },
  convTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  convEmpty: {
    ...typography.body,
    color: colors.text.tertiary,
  },
  convGroupLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    letterSpacing: 1,
  },
  convItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  convItemTitle: {
    ...typography.body,
    color: colors.text.primary,
  },
  convItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  convItemDate: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  convDeleteConfirm: {
    ...typography.caption,
    color: colors.accent.forge,
    fontWeight: '700',
  },
});
