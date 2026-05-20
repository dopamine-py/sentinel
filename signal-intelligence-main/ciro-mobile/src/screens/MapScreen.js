// Sector view — radar visualisation plus a list of active incidents.
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CRISIS_META } from '../api';
import {
  SentinelMark, Card, Eyebrow, RadarDisplay, SeverityPill, StatusPill, PulseDot,
} from '../ui/primitives';
import { useLiveRuns, formatAgo } from '../hooks/useLive';
import { colors, radii, spacing, type } from '../ui/theme';

export default function MapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { runs: liveRuns, lastUpdate, online, refresh } = useLiveRuns({ intervalMs: 6000 });
  const runs = (liveRuns || []).slice(0, 16);

  // Derive the radar tally from real runs instead of fixed numbers.
  const pad2 = (n) => String(n).padStart(2, '0');
  const sevOf = (r) => String(r.severity || '').toLowerCase();
  const criticalCount = runs.filter((r) => sevOf(r) === 'critical').length;
  const highCount = runs.filter((r) => sevOf(r) === 'high').length;
  const watchingCount = runs.length - criticalCount - highCount;

  const [refreshing, setRefreshing] = useState(false);
  const manual = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const byCity = runs.reduce((acc, r) => {
    const c = (r.location || '—').split(',').pop().trim() || '—';
    acc[c] = (acc[c] || 0) + 1;
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
      <View style={[s.headerRow, { paddingTop: insets.top + spacing(2) }]}>
        <SentinelMark />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PulseDot color={online ? colors.statusOk : colors.statusWarn} size={5} />
          <Text style={{ ...type.mono, fontSize: 10, color: online ? colors.statusOk : colors.statusWarn }}>
            {online ? `LIVE · ${formatAgo(lastUpdate)}` : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Radar block */}
      <Card raised style={cardMx}>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <RadarDisplay size={240} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 }}>
          <RadarStat label="CRITICAL" value={pad2(criticalCount)} color={colors.statusCritical} />
          <RadarStat label="HIGH"     value={pad2(highCount)}     color={colors.statusWarn} />
          <RadarStat label="WATCHING" value={pad2(Math.max(0, watchingCount))} color={colors.accentCyan} />
        </View>
      </Card>

      {/* Cities */}
      <View style={{ paddingHorizontal: spacing(4), marginTop: spacing(4) }}>
        <Eyebrow>By city</Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {Object.keys(byCity).length === 0 ? (
            <Card style={{ flex: 1 }}>
              <Text style={{ ...type.body, fontSize: 13, color: colors.textTertiary }}>
                No runs yet — sweep is awaiting first ingestion.
              </Text>
            </Card>
          ) : Object.entries(byCity).map(([city, count]) => (
            <View
              key={city}
              style={{
                flex: 1, minWidth: '46%',
                backgroundColor: colors.surface1,
                borderWidth: 1, borderColor: colors.line,
                borderRadius: radii.md, padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MapPin size={12} color={colors.accentCyan} strokeWidth={1.75} />
                <Text style={{ ...type.title, fontSize: 14, color: colors.textPrimary }}>{city}</Text>
              </View>
              <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 4 }}>
                {count} incident{count === 1 ? '' : 's'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Active incidents */}
      <View style={{ paddingHorizontal: spacing(4), marginTop: spacing(4) }}>
        <Eyebrow>Active incidents</Eyebrow>
        <View style={{ marginTop: 8, gap: 6 }}>
          {runs.length === 0 ? (
            <Card>
              <Text style={{ ...type.body, fontSize: 13, color: colors.textTertiary }}>
                No active incidents.
              </Text>
            </Card>
          ) : runs.map((r) => (
            <TouchableOpacity
              key={r.run_id}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('Home', { screen: 'Detail', params: { runId: r.run_id } })}
            >
              <IncidentRow run={r} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function IncidentRow({ run }) {
  const meta = CRISIS_META[run.crisis_type] || { icon: '◆', label: run.crisis_type || 'Unknown' };
  const ts = (() => {
    try { return new Date(run.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  })();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 30, height: 30, borderRadius: radii.md,
          backgroundColor: colors.surface2,
          borderWidth: 1, borderColor: colors.line,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 14 }}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...type.title, fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>{meta.label}</Text>
          <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
            {run.location || '—'} · {ts}
          </Text>
        </View>
        {!!run.severity && <SeverityPill severity={String(run.severity).toUpperCase()} />}
      </View>
    </Card>
  );
}

function RadarStat({ label, value, color }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={{ ...type.mono, fontSize: 14, color, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

const cardMx = { marginHorizontal: spacing(4) };

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
});
