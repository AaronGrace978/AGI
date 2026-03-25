import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { colors, spacing } from '../../src/theme';
import { StatusDot } from '../../src/components/StatusDot';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabLayout() {
  const spark = useStore(s => s.spark);
  const isStreaming = useStore(s => s.isStreaming);
  const arena = useStore(s => s.arena);
  const voiceState = useStore(s => s.voiceState);
  const nightMind = useStore(s => s.nightMind);
  const gauntlet = useStore(s => s.gauntlet);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg.secondary,
          borderTopColor: colors.border.subtle,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.accent.nexus,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'NEXUS',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="chatbubbles" size={size} color={color} />
              {(isStreaming || nightMind.active) && (
                <View style={styles.dotBadge}>
                  <StatusDot status={isStreaming ? 'processing' : 'online'} size={6} />
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="spark"
        options={{
          title: 'SPARK',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="flash" size={size} color={color} />
              {spark.thermo.ignited && (
                <View style={styles.dotBadge}>
                  <StatusDot status="online" size={6} />
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="voice"
        options={{
          title: 'VOICE',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="mic" size={size} color={color} />
              {voiceState.isSpeaking && (
                <View style={styles.dotBadge}>
                  <StatusDot status="processing" size={6} />
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="mind"
        options={{
          title: 'MIND',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="git-network" size={size} color={color} />
              {arena.active && (
                <View style={styles.dotBadge}>
                  <StatusDot status="processing" size={6} />
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'MORE',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="grid" size={size} color={color} />
              {gauntlet.active && (
                <View style={styles.dotBadge}>
                  <StatusDot status="processing" size={6} />
                </View>
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dotBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
  },
});
