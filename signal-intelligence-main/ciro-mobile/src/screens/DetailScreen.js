// Mission detail — single run, full transparency. Updates live every 4s.
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import {
  AlertTriangle, ChevronDown, ChevronRight, ArrowRight, CheckCircle2,
  Activity as ActivityIcon, Users, Clock, Database,
} from 'lucide-react-native';
import { adaptRun, CRISIS_META } from '../api';
import {
  SentinelMark, Eyebrow, Card, SeverityPill, Pill, ConfidenceBar,
  OrchestrationGraph, StatTile, PulseDot, AGENTS,
} from '../ui/primitives';
import IncidentMap from '../ui/IncidentMap';
import { useLiveRun, formatAgo } from '../hooks/useLive';
import { colors, radii, spacing, type } from '../ui/theme';

export default function DetailScreen({ route, navigation }) {
  const { runId } = route.params || {};
  const { run: raw, lastUpdate, online } = useLiveRun(runId, { intervalMs: 4000 });
  const data = raw ? adaptRun(raw) : null;
  const loading = !raw && online === null;
  const [openTrace, setOpenTrace] = useState(0);

  if (loading) {
    return (
      <View style={s.empty}>
        <ActivityIndicator color={colors.accentCyan} />
        <Text style={{ ...type.mono, color: colors.textTertiary, marginTop: 12, fontSize: 11 }}>
          Loading {runId}…
        </Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={s.empty}>
        <Text style={{ ...type.title, color: colors.textPrimary }}>Run unavailable</Text>
        <Text style={{ ...type.body, color: colors.textTertiary, marginTop: 6, fontSize: 13 }}>
          Could not load this run. Try again from Console.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: spacing(8) }}>
      {/* Header */}
      <View style={s.headerRow}>
        <SentinelMark size="sm" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={s.liveBadge}>
            <PulseDot color={online ? colors.statusOk : colors.statusWarn} size={5} />
            <Text style={{ ...type.mono, fontSize: 10, color: online ? colors.statusOk : colors.statusWarn }}>
              {online ? `LIVE · ${formatAgo(lastUpdate)}` : 'OFFLINE'}
            </Text>
          </View>
          <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary }}>{data.id}</Text>
        </View>
      </View>

      {/* Interactive map */}
      <IncidentMap run={data} style={cardMx} />

      {/* Detection card */}
      <Card raised style={[cardMx, { marginTop: spacing(3) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color={colors.statusAlert} strokeWidth={1.75} />
            <Text style={{ ...type.title, fontSize: 16, color: colors.textPrimary }}>Detected situation</Text>
          </View>
          <SeverityPill severity={data.detection.severity} />
        </View>

        <Text style={{ ...type.body, fontSize: 13, color: colors.textSecondary, marginTop: 10, lineHeight: 19 }}>
          {data.detection.description}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <StatTile label="Type" value={data.detection.type} />
          <StatTile label="Signals" value={String(data.detection.signalCount)} hint="cross-source" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <StatTile label="Location" value={data.detection.location} />
          <StatTile
            label="Coordinates"
            value={`${data.detection.coordinates.lat.toFixed(2)}°N`}
            hint={`${data.detection.coordinates.lng.toFixed(2)}°E`}
          />
        </View>

        <View style={{ marginTop: 14, gap: 10 }}>
          <ConfidenceBar value={data.detection.confidence} delta={0.04} label="Detection confidence" />
          <ConfidenceBar value={data.kpis.composite} delta={0.06} label="Composite KPI" />
        </View>
      </Card>

      {/* Impact */}
      <Card style={[cardMx, { marginTop: spacing(3) }]}>
        <SectionTitle title="Impact assessment" eyebrow="Exposure brief" />
        <Text style={{ ...type.body, fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 19 }}>
          {data.impact.summary}
        </Text>
        <View style={{ marginTop: 10, gap: 6 }}>
          {(data.impact.bullets || []).map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.statusWarn, marginTop: 7 }} />
              <Text style={{ ...type.body, fontSize: 12.5, color: colors.textPrimary, flex: 1, lineHeight: 18 }}>{b}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Meta icon={Users}    label="People"      value={data.impact.people} />
          <Meta icon={Clock}    label="Window"      value={data.impact.time} />
          <Meta icon={Database} label="Infra risk"  value={data.impact.infra} />
        </View>
      </Card>

      {/* Orchestration */}
      <Card style={[cardMx, { marginTop: spacing(3) }]}>
        <SectionTitle title="Agent orchestration" eyebrow="Mesh graph" />
        <OrchestrationGraph activeIndex={5} compact />
      </Card>

      {/* Reasoning trace */}
      <Card style={[cardMx, { marginTop: spacing(3), padding: 0 }]}>
        <View style={{ paddingHorizontal: spacing(4), paddingTop: spacing(4), paddingBottom: spacing(2) }}>
          <SectionTitle title="Reasoning trace" eyebrow="Audit log" />
        </View>
        {data.trace.map((t, idx) => {
          const a = AGENTS[t.agent];
          const Icon = a?.icon || ActivityIcon;
          const open = openTrace === idx;
          return (
            <View key={idx} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }}>
              <TouchableOpacity
                onPress={() => setOpenTrace(open ? -1 : idx)}
                activeOpacity={0.7}
                style={{ paddingHorizontal: spacing(4), paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary, width: 26 }}>
                  {String(t.step).padStart(2, '0')}
                </Text>
                <Icon size={14} color={colors.textSecondary} strokeWidth={1.75} />
                <Text style={{ ...type.title, fontSize: 13, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
                  {a?.name || t.agentName}
                </Text>
                <Text style={{ ...type.mono, fontSize: 10, color: colors.accentCyan }}>
                  {(t.confidence * 100).toFixed(0)}%
                </Text>
                <Text style={{ ...type.mono, fontSize: 10, color: colors.textTertiary, width: 44, textAlign: 'right' }}>
                  {t.ms}ms
                </Text>
                {open ? <ChevronDown size={12} color={colors.textTertiary} /> : <ChevronRight size={12} color={colors.textTertiary} />}
              </TouchableOpacity>
              {open && (
                <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(3), gap: 8 }}>
                  <TraceField label="Input"      value={t.input} />
                  <TraceField label="Reasoning"  value={t.reasoning} />
                  <TraceField label="Output"     value={t.output} />
                  <TraceField label="Tool calls" value={t.tools.join(' · ')} />
                </View>
              )}
            </View>
          );
        })}
      </Card>

      {/* Actions */}
      <Card style={[cardMx, { marginTop: spacing(3) }]}>
        <SectionTitle title="Action execution" eyebrow="Dispatch queue" />
        <Text style={{ ...type.body, fontSize: 12.5, color: colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
          {data.actions.coord}
        </Text>
        <View style={{ marginTop: 12, gap: 8 }}>
          {data.actions.items.map((act) => (
            <View key={`${act.p}-${act.action}`} style={s.actionRow}>
              <View style={s.actionPriority}>
                <Text style={{ ...type.mono, color: colors.textSecondary, fontSize: 12 }}>{act.p}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...type.title, color: colors.textPrimary, fontSize: 13 }} numberOfLines={2}>
                  {act.action}
                </Text>
                <Text style={{ ...type.mono, color: colors.textTertiary, fontSize: 10.5, marginTop: 3 }} numberOfLines={1}>
                  → {act.assignee} · {act.channel}
                </Text>
                {!!act.impact && (
                  <Text style={{ ...type.mono, color: colors.accentCyan, fontSize: 10.5, marginTop: 2 }} numberOfLines={1}>
                    impact: {act.impact}
                  </Text>
                )}
              </View>
              <ActionStatusPill status={act.status} />
            </View>
          ))}
        </View>
      </Card>

      {/* Outcomes */}
      {!!data.outcome && (
        <Card style={[cardMx, { marginTop: spacing(3) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color={colors.statusOk} strokeWidth={1.75} />
            <Text style={{ ...type.title, fontSize: 15, color: colors.textPrimary }}>After-action summary</Text>
          </View>
          <Text style={{ ...type.body, fontSize: 13, color: colors.textSecondary, marginTop: 10, lineHeight: 19 }}>
            {data.outcome}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <KpiTile label="Mobility"   value={data.kpis.mobility} />
            <KpiTile label="Safety"     value={data.kpis.safety} />
            <KpiTile label="Equity"     value={data.kpis.equity} />
            <KpiTile label="Composite"  value={data.kpis.composite} />
          </View>
        </Card>
      )}

      {/* Simulation log */}
      {data.log.length > 0 && (
        <Card style={[cardMx, { marginTop: spacing(3) }]}>
          <SectionTitle title="Impact timeline" eyebrow="Ticket trail" />
          <View style={{ marginTop: 8, gap: 8 }}>
            {data.log.map((l) => (
              <View key={l.ticket} style={s.actionRow}>
                <Text style={{ ...type.mono, fontSize: 10.5, color: colors.accentCyan, minWidth: 60 }}>{l.ticket}</Text>
                <Text style={{ ...type.body, fontSize: 12.5, color: colors.textPrimary, flex: 1, lineHeight: 18 }} numberOfLines={3}>
                  {l.text}
                </Text>
                <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary }}>{l.ts}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

function SectionTitle({ title, eyebrow, right }) {
  return (
    <View>
      {!!eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: eyebrow ? 4 : 0 }}>
        <Text style={{ ...type.title, fontSize: 15, color: colors.textPrimary }}>{title}</Text>
        {right}
      </View>
    </View>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <View style={{
      flexBasis: '48%', flexGrow: 1,
      backgroundColor: colors.surface2,
      borderWidth: 1, borderColor: colors.line, borderRadius: radii.md,
      padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
    }}>
      <View style={{
        width: 26, height: 26, borderRadius: radii.sm,
        backgroundColor: colors.surface3,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={12} color={colors.textSecondary} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow>{label}</Eyebrow>
        <Text style={{ ...type.title, color: colors.textPrimary, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function TraceField({ label, value }) {
  return (
    <View style={{
      backgroundColor: colors.surface2,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
      borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 8,
    }}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={{ ...type.mono, fontSize: 11.5, color: colors.textPrimary, marginTop: 4, lineHeight: 17 }}>
        {value || '—'}
      </Text>
    </View>
  );
}

function ActionStatusPill({ status }) {
  const variantMap = {
    complete:   'ok',
    ack:        'low',
    dispatched: 'high',
    queued:     'medium',
  };
  return <Pill variant={variantMap[status] || 'muted'}>{status}</Pill>;
}

function KpiTile({ label, value }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.surface2,
      borderWidth: 1, borderColor: colors.line, borderRadius: radii.md,
      paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center',
    }}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={{ ...type.display, fontSize: 18, color: colors.accentCyan, marginTop: 4 }}>{pct}</Text>
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
  empty: {
    flex: 1, backgroundColor: colors.surface0,
    alignItems: 'center', justifyContent: 'center', padding: spacing(6),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  actionPriority: {
    width: 26, height: 26,
    borderRadius: radii.sm,
    backgroundColor: colors.surface3,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
});

void ArrowRight;
