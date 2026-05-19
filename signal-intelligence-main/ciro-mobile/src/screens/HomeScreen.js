// Console — live signal feed, mission trigger, recent runs.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView,
  StyleSheet, TextInput, Alert, Vibration,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Radar, PlayCircle, Activity, Wifi, WifiOff } from 'lucide-react-native';

import {
  fetchScenarios,
  runLiveScan,
  runScenario,
  CRISIS_META,
} from '../api';
import { sendCrisisAlert } from '../notifications';
import { useLiveRuns, formatAgo } from '../hooks/useLive';

import {
  SentinelMark, StatusPill, Eyebrow, SeverityPill, Card, ConfidenceBar,
  OrchestrationGraph, PrimaryButton, GhostButton, ProgressSweep, StatTile,
  PulseDot, AGENT_ORDER, AGENTS,
} from '../ui/primitives';
import { colors, radii, spacing, type } from '../ui/theme';

const SCENARIO_PRESETS = [
  { id: 'urban_flooding',         label: 'Flood',        icon: '🌊', city: 'Karachi' },
  { id: 'heatwave',               label: 'Heatwave',     icon: '🔥', city: 'Multan' },
  { id: 'accident',               label: 'Accident',     icon: '🚗', city: 'Karachi' },
  { id: 'road_blockage',          label: 'Blockage',     icon: '🚧', city: 'Lahore' },
  { id: 'infrastructure_failure', label: 'Power',        icon: '⚡', city: 'Karachi' },
];

export default function HomeScreen({ navigation }) {
  const [scenarios, setScenarios] = useState([]);
  const [scenario, setScenario] = useState('urban_flooding');
  const [customSignal, setCustomSignal] = useState('');
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Live polling — every 6s
  const onNewRun = useCallback((r) => {
    Vibration.vibrate(15);
    sendCrisisAlert({
      runId: r.run_id,
      title: `Sentinel · ${(CRISIS_META[r.crisis_type]?.label) || (r.crisis_type || 'incident')}`,
      body: r.location || '',
    }).catch(() => {});
  }, []);
  const { runs: liveRuns, lastUpdate, online: backendOnline, refresh } = useLiveRuns({
    intervalMs: 6000,
    onNewRun,
  });
  const runs = (liveRuns || []).slice(0, 20);

  // One-time fetch of available scenarios when backend first comes online
  useEffect(() => {
    if (backendOnline === true && scenarios.length === 0) {
      fetchScenarios().then((s) => s && s.length && setScenarios(s)).catch(() => {});
    }
  }, [backendOnline, scenarios.length]);

  const [refreshing, setRefreshing] = useState(false);
  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Animate orchestration while a run is in flight
  useEffect(() => {
    if (!running) { setActiveStep(0); return; }
    setActiveStep(0);
    const interval = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, 5));
    }, 900);
    return () => clearInterval(interval);
  }, [running]);

  const handleRun = async (kind) => {
    if (running) return;
    setRunning(true);
    try {
      const result = kind === 'live'
        ? await runLiveScan()
        : await runScenario(scenario, customSignal.trim());
      const run = result && result.data;
      if (run && run.detected_crisis) {
        Vibration.vibrate(20);
        sendCrisisAlert(
          { runId: run.run_id, title: `${CRISIS_META[run.detected_crisis.crisis_type]?.label || run.detected_crisis.crisis_type}`, body: run.detected_crisis.description }
        );
        navigation.navigate('Detail', { runId: run.run_id });
      } else {
        Alert.alert('Run complete', 'No crisis detected in this run.');
      }
      await refresh();
    } catch (e) {
      Alert.alert('Run failed', String(e && e.message) || 'Backend unreachable. Check Settings → API base.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={{ paddingBottom: spacing(8) }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleManualRefresh}
          tintColor={colors.accentCyan}
          colors={[colors.accentCyan]}
        />
      }
    >
      {/* Header */}
      <View style={s.headerRow}>
        <SentinelMark />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LiveBadge online={backendOnline} lastUpdate={lastUpdate} />
          <BackendBadge online={backendOnline} />
        </View>
      </View>

      {/* Hero block — the run pipeline */}
      <Card raised style={{ marginHorizontal: spacing(4), marginTop: spacing(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Eyebrow>Console</Eyebrow>
            <Text style={{ ...type.display, fontSize: 22, color: colors.textPrimary, marginTop: 4 }}>
              Run a mission
            </Text>
          </View>
          <StatusPill state={running ? 'alert' : 'online'} label={running ? 'Running' : 'Standby'} />
        </View>

        <Text style={{ ...type.body, fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 19 }}>
          Pick a scenario or pipe a custom signal. Six agents will observe, verify, decide, execute and adapt.
        </Text>

        {/* Scenario chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {SCENARIO_PRESETS.map((s) => {
            const active = scenario === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                disabled={running}
                onPress={() => setScenario(s.id)}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8,
                  borderRadius: radii.md,
                  backgroundColor: active ? colors.accentCyanSoft : colors.surface2,
                  borderWidth: 1,
                  borderColor: active ? colors.accentCyanOutline : colors.line,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                <Text style={{ fontSize: 14 }}>{s.icon}</Text>
                <Text style={{ ...type.title, fontSize: 12.5, color: colors.textPrimary }}>{s.label}</Text>
                <Text style={{ ...type.mono, fontSize: 10, color: colors.textTertiary }}>· {s.city}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom signal */}
        <Eyebrow style={{ marginTop: 16 }}>Custom signal · optional</Eyebrow>
        <TextInput
          value={customSignal}
          onChangeText={setCustomSignal}
          editable={!running}
          multiline
          placeholder="Saddar mein paani bhar gaya, traffic jam hai..."
          placeholderTextColor={colors.textTertiary}
          style={{
            marginTop: 6,
            minHeight: 60,
            backgroundColor: colors.surface2,
            borderWidth: 1, borderColor: colors.line,
            borderRadius: radii.md,
            paddingHorizontal: 10, paddingVertical: 8,
            color: colors.textPrimary,
            ...type.body, fontSize: 13,
            textAlignVertical: 'top',
          }}
        />

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <PrimaryButton
            onPress={() => handleRun('scenario')}
            disabled={running || backendOnline === false}
            icon={PlayCircle}
            style={{ flex: 1 }}
          >
            {running ? 'Running' : 'Run mission'}
          </PrimaryButton>
          <GhostButton
            onPress={() => handleRun('live')}
            disabled={running || backendOnline === false}
            icon={Radar}
            style={{ flex: 1 }}
          >
            Live scan
          </GhostButton>
        </View>

        {running && (
          <View style={{ marginTop: 14 }}>
            <ProgressSweep />
            <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 6 }}>
              <Text style={{ color: colors.accentCyan }}>
                {String(Math.min(activeStep + 1, 6)).padStart(2, '0')} / 06
              </Text>
              {'  '}· {AGENTS[AGENT_ORDER[Math.min(activeStep, 5)]]?.name}
            </Text>
          </View>
        )}
      </Card>

      {/* Orchestration preview */}
      <Card style={{ marginHorizontal: spacing(4), marginTop: spacing(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Eyebrow>Agent mesh</Eyebrow>
          <Eyebrow color={colors.accentCyan}>{running ? 'LIVE' : '6/6 ONLINE'}</Eyebrow>
        </View>
        <OrchestrationGraph activeIndex={running ? activeStep : -1} compact />
      </Card>

      {/* Recent runs */}
      <View style={{ paddingHorizontal: spacing(4), marginTop: spacing(4) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Eyebrow>Recent runs</Eyebrow>
          <Eyebrow>{runs.length}</Eyebrow>
        </View>
        {backendOnline === false ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <WifiOff size={14} color={colors.statusWarn} />
              <Text style={{ ...type.body, fontSize: 13, color: colors.textSecondary, flex: 1 }}>
                Backend offline. Set the API base in Settings or start the server on{' '}
                <Text style={{ ...type.mono, color: colors.textPrimary }}>:8000</Text>.
              </Text>
            </View>
          </Card>
        ) : runs.length === 0 ? (
          <Card>
            <Text style={{ ...type.body, fontSize: 13, color: colors.textTertiary }}>
              No runs yet. Trigger a mission to begin.
            </Text>
          </Card>
        ) : (
          <FlatList
            data={runs}
            scrollEnabled={false}
            keyExtractor={(item) => item.run_id}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            renderItem={({ item }) => <RunRow run={item} onPress={() => navigation.navigate('Detail', { runId: item.run_id })} />}
          />
        )}
      </View>
    </ScrollView>
  );
}

function RunRow({ run, onPress }) {
  const meta = CRISIS_META[run.crisis_type] || { icon: '◆', label: run.crisis_type || 'Unknown' };
  const sev = (run.severity || '').toUpperCase();
  const ts = (() => {
    try { return new Date(run.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  })();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 32, height: 32, borderRadius: radii.md,
              backgroundColor: colors.surface2,
              borderWidth: 1, borderColor: colors.line,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ ...type.title, fontSize: 13.5, color: colors.textPrimary }} numberOfLines={1}>
              {meta.label}
            </Text>
            <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
              {run.run_id} · {run.location || '—'} · {ts}
            </Text>
          </View>
          {!!sev && <SeverityPill severity={sev} />}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function LiveBadge({ online, lastUpdate }) {
  if (online === null) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: online ? 'rgba(52, 211, 153, 0.30)' : 'rgba(245, 158, 11, 0.30)',
      }}
    >
      <PulseDot color={online ? colors.statusOk : colors.statusWarn} size={5} />
      <Text
        style={{
          ...type.mono, fontSize: 10,
          color: online ? colors.statusOk : colors.statusWarn,
        }}
      >
        {online ? `LIVE · ${formatAgo(lastUpdate)}` : 'OFFLINE'}
      </Text>
    </View>
  );
}

function BackendBadge({ online }) {
  if (online === null) {
    return (
      <View style={{ ...badgeStyle, borderColor: colors.line }}>
        <Activity size={11} color={colors.textTertiary} />
        <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary }}>Probing…</Text>
      </View>
    );
  }
  return (
    <View
      style={{
        ...badgeStyle,
        borderColor: online ? 'rgba(52, 211, 153, 0.30)' : 'rgba(245, 158, 11, 0.30)',
      }}
    >
      {online ? <Wifi size={11} color={colors.statusOk} /> : <WifiOff size={11} color={colors.statusWarn} />}
      <Text
        style={{
          ...type.mono, fontSize: 10.5,
          color: online ? colors.statusOk : colors.statusWarn,
        }}
      >
        {online ? 'LIVE' : 'OFFLINE'}
      </Text>
    </View>
  );
}

const badgeStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 999,
  backgroundColor: colors.surface2,
  borderWidth: 1,
};

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
