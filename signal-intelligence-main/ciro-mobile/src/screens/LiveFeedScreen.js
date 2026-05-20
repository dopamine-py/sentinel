// Live Signal Feed — real-time ticker showing signals from the latest CIRO run.
// Mirrors the web dashboard's right-rail live signal feed.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Animated,
} from 'react-native';
import { Radio, Wifi, WifiOff, CloudRain, Car, MessageCircle, Thermometer, Activity } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { SentinelMark, Card, Eyebrow, PulseDot } from '../ui/primitives';
import { useLiveSignals, useLiveRuns, formatAgo } from '../hooks/useLive';
import { colors, radii, spacing, type } from '../ui/theme';

const SOURCE_ICON = {
  Social:  MessageCircle,
  Weather: CloudRain,
  Traffic: Car,
  Citizen: MessageCircle,
  Sensor:  Thermometer,
};

function SignalCard({ signal, index }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, index]);

  const Icon = SOURCE_ICON[signal.src] || Activity;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={s.signalCard}>
        {/* Source badge */}
        <View style={s.signalHeader}>
          <View style={[s.sourceBadge, { borderColor: signal.color + '40' }]}>
            <Icon size={10} color={signal.color} strokeWidth={2} />
            <Text style={[type.mono, { fontSize: 9.5, color: signal.color, letterSpacing: 0.8 }]}>
              {signal.src.toUpperCase()}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[type.mono, { fontSize: 9.5, color: colors.textTertiary }]}>
              {signal.geo}
            </Text>
            <Text style={[type.mono, { fontSize: 9, color: colors.textTertiary }]}>
              · {signal.ts}
            </Text>
          </View>
        </View>

        {/* Signal text */}
        <Text style={s.signalText} numberOfLines={3}>
          {signal.text}
        </Text>

        {/* Metadata tags */}
        {signal.meta && (signal.meta.platform || signal.meta.source_name || signal.meta.alert_level) && (
          <View style={s.metaRow}>
            {signal.meta.platform && (
              <View style={s.metaTag}>
                <Text style={s.metaTagText}>{signal.meta.platform}</Text>
              </View>
            )}
            {signal.meta.source_name && (
              <View style={s.metaTag}>
                <Text style={s.metaTagText}>{signal.meta.source_name}</Text>
              </View>
            )}
            {signal.meta.alert_level && signal.meta.alert_level !== 'GREEN' && (
              <View style={[s.metaTag, {
                borderColor: signal.meta.alert_level === 'RED' ? colors.statusAlert + '40' : colors.statusWarn + '40',
              }]}>
                <Text style={[s.metaTagText, {
                  color: signal.meta.alert_level === 'RED' ? colors.statusAlert : colors.statusWarn,
                }]}>
                  {signal.meta.alert_level}
                </Text>
              </View>
            )}
            {signal.meta.matched_keywords && signal.meta.matched_keywords.length > 0 && (
              <View style={s.metaTag}>
                <Text style={s.metaTagText}>
                  {signal.meta.matched_keywords.slice(0, 2).join(', ')}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export default function LiveFeedScreen() {
  const insets = useSafeAreaInsets();
  const { signals, online: signalOnline } = useLiveSignals({ intervalMs: 6000, max: 30 });
  const { runs, lastUpdate, online, refresh } = useLiveRuns({ intervalMs: 6000 });

  const [refreshing, setRefreshing] = useState(false);
  const manual = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Count by source type
  const bySrc = signals.reduce((acc, s) => {
    acc[s.src] = (acc[s.src] || 0) + 1;
    return acc;
  }, {});

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={{ paddingBottom: spacing(8) }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={manual}
          tintColor={colors.accentCyan}
          colors={[colors.accentCyan]}
        />
      }
    >
      {/* Header */}
      <View style={[s.headerRow, { paddingTop: insets.top + spacing(2) }]}>
        <SentinelMark />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PulseDot color={online ? colors.statusOk : colors.statusWarn} size={5} />
          <Text style={{ ...type.mono, fontSize: 10, color: online ? colors.statusOk : colors.statusWarn }}>
            {online ? `LIVE · ${formatAgo(lastUpdate)}` : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Title card */}
      <Card raised style={{ marginHorizontal: spacing(4) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={s.iconBox}>
            <Radio size={16} color={colors.accentCyan} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...type.display, fontSize: 18, color: colors.textPrimary }}>
              Live Signal Feed
            </Text>
            <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }}>
              {signals.length} signals · {Object.keys(bySrc).length} source types
            </Text>
          </View>
        </View>

        {/* Source breakdown */}
        {Object.keys(bySrc).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {Object.entries(bySrc).map(([src, count]) => {
              const Icon = SOURCE_ICON[src] || Activity;
              const col = {
                Social: '#818cf8', Weather: '#fbbf24', Traffic: '#a78bfa',
                Citizen: '#fb7185', Sensor: '#34d399',
              }[src] || colors.accentCyan;
              return (
                <View key={src} style={[s.srcChip, { borderColor: col + '30' }]}>
                  <Icon size={10} color={col} strokeWidth={2} />
                  <Text style={{ ...type.mono, fontSize: 9.5, color: col }}>{src}</Text>
                  <Text style={{ ...type.mono, fontSize: 9.5, color: colors.textTertiary }}>{count}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* Signal list */}
      <View style={{ paddingHorizontal: spacing(4), marginTop: spacing(3) }}>
        <Eyebrow>Ingested signals</Eyebrow>
        <View style={{ marginTop: 8, gap: 6 }}>
          {signals.length === 0 ? (
            <Card>
              <View style={{ alignItems: 'center', paddingVertical: spacing(4) }}>
                {online === false ? (
                  <>
                    <WifiOff size={20} color={colors.statusWarn} strokeWidth={1.5} />
                    <Text style={{ ...type.body, fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
                      Backend offline. No signals available.
                    </Text>
                  </>
                ) : (
                  <>
                    <Radio size={20} color={colors.textTertiary} strokeWidth={1.5} />
                    <Text style={{ ...type.body, fontSize: 13, color: colors.textTertiary, marginTop: 8, textAlign: 'center' }}>
                      No signals yet. Run a mission to populate the feed.
                    </Text>
                  </>
                )}
              </View>
            </Card>
          ) : (
            signals.map((sig, idx) => (
              <SignalCard key={sig.id} signal={sig} index={idx} />
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface0 },
  headerRow: {
    paddingHorizontal: spacing(4),
    paddingTop: spacing(2),
    paddingBottom: spacing(3),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 36, height: 36, borderRadius: radii.md,
    backgroundColor: colors.accentCyanSoft,
    borderWidth: 1, borderColor: colors.accentCyanOutline,
    alignItems: 'center', justifyContent: 'center',
  },
  signalCard: {
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 12,
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
  },
  signalText: {
    ...type.body,
    fontSize: 12.5,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  metaTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metaTagText: {
    ...type.mono,
    fontSize: 9,
    color: colors.textTertiary,
  },
  srcChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
  },
});
