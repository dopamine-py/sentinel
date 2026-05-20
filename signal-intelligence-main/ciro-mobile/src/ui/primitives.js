// Sentinel primitives for React Native — restrained, hairline borders, single accent.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Easing } from 'react-native';
import Svg, { Circle, Line, Defs, LinearGradient, Stop, G, Rect, Path } from 'react-native-svg';
import {
  Eye, Radio, ShieldCheck, Brain, Workflow, Activity, Sparkles,
} from 'lucide-react-native';
import { colors, radii, spacing, type } from './theme';

/* ============================================================
   BRAND MARK
   ============================================================ */
export function SentinelLogo({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Defs>
        <LinearGradient id="snShield" x1="48" y1="14" x2="48" y2="84" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FF7A45" />
          <Stop offset="0.45" stopColor="#F5402C" />
          <Stop offset="1" stopColor="#C2160C" />
        </LinearGradient>
        <LinearGradient id="snWave" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF6A3D" />
          <Stop offset="1" stopColor="#D81E10" />
        </LinearGradient>
      </Defs>
      <G stroke="url(#snWave)" strokeWidth="5" strokeLinecap="round" fill="none">
        <Path d="M30 30 Q20 48 30 66" opacity={0.95} />
        <Path d="M21 24 Q7 48 21 72" opacity={0.6} />
        <Path d="M12 19 Q-6 48 12 77" opacity={0.32} />
        <Path d="M66 30 Q76 48 66 66" opacity={0.95} />
        <Path d="M75 24 Q89 48 75 72" opacity={0.6} />
        <Path d="M84 19 Q102 48 84 77" opacity={0.32} />
      </G>
      <Path
        d="M48 13 L73 21 C74 21 74 22 74 23 C74 38 73 47 70 54 C66 64 58 71 48 76 C38 71 30 64 26 54 C23 47 22 38 22 23 C22 22 22 21 23 21 Z"
        fill="url(#snShield)"
        stroke="#FF9A6B"
        strokeOpacity={0.55}
        strokeWidth={1.5}
      />
      <Path
        d="M44.4 30 C44.4 28 45.9 26.5 48 26.5 C50.1 26.5 51.6 28 51.5 30 L50.4 49 C50.3 50.4 49.3 51.4 48 51.4 C46.7 51.4 45.7 50.4 45.6 49 Z"
        fill="#FFFFFF"
      />
      <Rect x="44.3" y="55.5" width="7.4" height="7.4" rx="2.4" fill="#FFFFFF" />
    </Svg>
  );
}

export function SentinelMark({ size = 'md' }) {
  const px = size === 'sm' ? 24 : size === 'lg' ? 36 : 28;
  const textSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  return (
    <View style={s.markRow}>
      <SentinelLogo size={px} />
      <Text style={[type.title, { fontSize: textSize, color: colors.textPrimary, marginLeft: 10 }]}>
        Sentinel
      </Text>
    </View>
  );
}

/* ============================================================
   PILL (severity / status / generic)
   ============================================================ */
export function Pill({ variant = 'muted', children, style }) {
  const v = colors.severityFills[variant] || colors.severityFills.muted;
  return (
    <View
      style={[
        {
          paddingHorizontal: 8, paddingVertical: 2,
          borderRadius: radii.sm,
          backgroundColor: v.bg,
          borderWidth: StyleSheet.hairlineWidth, borderColor: v.border,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text style={{ ...type.mono, color: v.fg, fontSize: 10, letterSpacing: 0.8 }}>
        {String(children).toUpperCase()}
      </Text>
    </View>
  );
}

export function SeverityPill({ severity }) {
  const v = (severity || '').toLowerCase();
  const variant =
    v === 'critical' ? 'critical' :
    v === 'high' ? 'high' :
    v === 'medium' ? 'medium' :
    v === 'low' ? 'low' :
    'muted';
  return <Pill variant={variant}>{severity}</Pill>;
}

/* ============================================================
   STATUS PILL — system heartbeat
   ============================================================ */
export function StatusPill({ state = 'online', label }) {
  const map = {
    online:   { dot: colors.statusOk,       text: colors.statusOk,      msg: 'Operational' },
    alert:    { dot: colors.statusAlert,    text: colors.statusAlert,   msg: 'Active incident' },
    degraded: { dot: colors.statusWarn,     text: colors.statusWarn,    msg: 'Degraded' },
    offline:  { dot: colors.textTertiary,   text: colors.textTertiary,  msg: 'Offline' },
  };
  const c = map[state] || map.offline;
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 4,
        backgroundColor: colors.surface2,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
        borderRadius: radii.md,
        gap: 6,
      }}
    >
      <PulseDot color={c.dot} />
      <Text style={{ ...type.title, color: c.text, fontSize: 11.5 }}>{label || c.msg}</Text>
    </View>
  );
}

/* ============================================================
   PULSE DOT — soft heartbeat
   ============================================================ */
export function PulseDot({ color = colors.accentCyan, size = 6 }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size + 6, height: size + 6, borderRadius: (size + 6) / 2,
          borderWidth: 1, borderColor: color,
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

/* ============================================================
   CARD — flat surface with hairline border
   ============================================================ */
export function Card({ raised = false, style, children }) {
  return (
    <View
      style={[
        {
          backgroundColor: raised ? colors.surface2 : colors.surface1,
          borderRadius: radii.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
          padding: spacing(4),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ============================================================
   EYEBROW LABEL
   ============================================================ */
export function Eyebrow({ children, style, color }) {
  return (
    <Text style={[type.eyebrow, color ? { color } : null, style]}>{children}</Text>
  );
}

/* ============================================================
   CONFIDENCE BAR
   ============================================================ */
export function ConfidenceBar({ value, label = 'Confidence', delta, showLabel = true }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View>
      {showLabel && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Eyebrow>{label}</Eyebrow>
          <Text style={{ ...type.mono, color: colors.textSecondary, fontSize: 11 }}>
            {pct}%
            {typeof delta === 'number' && (
              <Text style={{ color: delta >= 0 ? colors.statusOk : colors.statusAlert }}>
                {' '}{delta >= 0 ? '↑' : '↓'}{Math.abs(Math.round(delta * 100))}
              </Text>
            )}
          </Text>
        </View>
      )}
      <View style={{ marginTop: 6, height: 3, borderRadius: 999, backgroundColor: colors.surface3, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.accentCyan, borderRadius: 999 }} />
      </View>
    </View>
  );
}

/* ============================================================
   AGENT CONSTANTS — mirror the web app
   ============================================================ */
export const AGENT_ORDER = ['scout', 'verification', 'decision', 'execution', 'monitoring', 'adaptation'];
export const AGENTS = {
  scout:         { code: 'AGT.01', name: 'Scout',        icon: Radio,       role: 'Streams citizen, social, weather and traffic signals.' },
  verification:  { code: 'AGT.02', name: 'Verification', icon: ShieldCheck, role: 'Cross-checks signals, suppresses noise, scores trust.' },
  decision:      { code: 'AGT.03', name: 'Decision',     icon: Brain,       role: 'Reasons over evidence, drafts the response plan.' },
  execution:     { code: 'AGT.04', name: 'Execution',    icon: Workflow,    role: 'Dispatches across radio, SMS, traffic and SCADA.' },
  monitoring:    { code: 'AGT.05', name: 'Monitoring',   icon: Activity,    role: 'Tracks throughput, outcomes, response effectiveness.' },
  adaptation:    { code: 'AGT.06', name: 'Adaptation',   icon: Sparkles,    role: 'Revises the plan as ground truth changes.' },
};

/* ============================================================
   AGENT NODE — small, restrained
   ============================================================ */
export function AgentNode({ agentKey, state = 'idle', size = 'md' }) {
  const a = AGENTS[agentKey];
  if (!a) return null;
  const dim = size === 'sm' ? 32 : size === 'lg' ? 44 : 36;
  const iconSize = dim * 0.45;
  const borderColor =
    state === 'running' ? colors.accentCyanOutline :
    state === 'done'    ? 'rgba(52, 211, 153, 0.45)' :
    state === 'error'   ? 'rgba(239, 68, 68, 0.45)' :
                          colors.line;
  const iconColor =
    state === 'running' ? colors.accentCyan :
    state === 'done'    ? colors.statusOk :
    state === 'error'   ? colors.statusCritical :
                          colors.textSecondary;
  const Icon = a.icon;
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: dim, height: dim, borderRadius: radii.md,
          backgroundColor: colors.surface2,
          borderWidth: 1, borderColor,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon size={iconSize} color={iconColor} strokeWidth={1.75} />
      </View>
      <Text style={[type.eyebrow, { marginTop: 6, fontSize: 9, color: colors.textTertiary }]}>{a.code}</Text>
      <Text style={{ ...type.body, color: colors.textPrimary, fontSize: 11, marginTop: 1 }}>{a.name}</Text>
    </View>
  );
}

/* ============================================================
   ORCHESTRATION GRAPH — six agents in a row with flow lines
   ============================================================ */
export function OrchestrationGraph({ activeIndex = -1, compact = false }) {
  const items = AGENT_ORDER;
  return (
    <View style={{ paddingVertical: compact ? 16 : 24 }}>
      {/* SVG flow lines behind nodes */}
      <Svg
        height={compact ? 4 : 6}
        width="100%"
        viewBox="0 0 600 6"
        preserveAspectRatio="none"
        style={{ position: 'absolute', top: compact ? 32 : 40, left: 0, right: 0 }}
      >
        <Defs>
          <LinearGradient id="orchFlow" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="rgba(103,232,249,0)" />
            <Stop offset="0.5" stopColor="rgba(103,232,249,0.7)" />
            <Stop offset="1" stopColor="rgba(103,232,249,0)" />
          </LinearGradient>
        </Defs>
        {items.slice(0, -1).map((_, i) => {
          const x1 = 60 + i * 96;
          const x2 = 60 + (i + 1) * 96;
          const isLive = i < activeIndex;
          return (
            <G key={i}>
              <Line x1={x1} y1={3} x2={x2} y2={3} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              {isLive && (
                <Line
                  x1={x1} y1={3} x2={x2} y2={3}
                  stroke="url(#orchFlow)" strokeWidth={1.4}
                  strokeDasharray="4 6"
                />
              )}
            </G>
          );
        })}
      </Svg>

      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' }}>
        {items.map((k, i) => {
          const state =
            activeIndex < 0
              ? 'idle'
              : i < activeIndex
              ? 'done'
              : i === activeIndex
              ? 'running'
              : 'idle';
          return (
            <View key={k} style={{ flex: 1, alignItems: 'center' }}>
              <AgentNode agentKey={k} state={state} size={compact ? 'sm' : 'md'} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ============================================================
   RADAR DISPLAY — single-ring sweep + dots
   ============================================================ */
export function RadarDisplay({ size = 180 }) {
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  const rotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const r = size / 2;
  const dots = [
    { x: 0.30, y: 0.42, color: colors.statusCritical, size: 4 },
    { x: 0.72, y: 0.30, color: colors.statusWarn,     size: 3 },
    { x: 0.55, y: 0.60, color: colors.accentCyan,     size: 3 },
    { x: 0.40, y: 0.74, color: colors.statusOk,       size: 3 },
    { x: 0.82, y: 0.62, color: colors.accentCyan,     size: 2 },
    { x: 0.20, y: 0.62, color: colors.statusWarn,     size: 2 },
  ];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* rings */}
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={r} cy={r} r={r * 0.92} stroke="rgba(103,232,249,0.10)" strokeWidth={1} fill="none" />
        <Circle cx={r} cy={r} r={r * 0.62} stroke="rgba(103,232,249,0.10)" strokeWidth={1} fill="none" />
        <Circle cx={r} cy={r} r={r * 0.32} stroke="rgba(103,232,249,0.10)" strokeWidth={1} fill="none" />
        <Line x1={r} y1={r * 0.05} x2={r} y2={r * 1.95} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
        <Line x1={r * 0.05} y1={r} x2={r * 1.95} y2={r} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
      </Svg>

      {/* sweep arm */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size, height: size,
          transform: [{ rotate }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: r - 1, top: r * 0.08,
            width: 2, height: r - r * 0.08,
            backgroundColor: 'rgba(103,232,249,0.55)',
          }}
        />
      </Animated.View>

      {/* dots */}
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: d.x * size - d.size,
            top: d.y * size - d.size,
            width: d.size * 2,
            height: d.size * 2,
            borderRadius: d.size,
            backgroundColor: d.color,
          }}
        />
      ))}

      {/* center */}
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accentCyan }} />
    </View>
  );
}

/* ============================================================
   SECTION HEADER
   ============================================================ */
export function SectionHeader({ eyebrow, title, right, style }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {!!eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: eyebrow ? 4 : 0 }}>
        <Text style={{ ...type.title, fontSize: 17, color: colors.textPrimary, flex: 1 }}>{title}</Text>
        {right}
      </View>
    </View>
  );
}

/* ============================================================
   BUTTONS
   ============================================================ */
export function PrimaryButton({ onPress, disabled, children, icon: Icon, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 11,
          paddingHorizontal: 16,
          borderRadius: radii.md,
          backgroundColor: disabled ? '#3a3d44' : colors.textPrimary,
          opacity: pressed ? 0.85 : 1,
          gap: 8,
        },
        style,
      ]}
    >
      {Icon && <Icon size={14} color={disabled ? colors.textTertiary : colors.surface0} strokeWidth={2} />}
      <Text style={{ ...type.title, color: disabled ? colors.textTertiary : colors.surface0, fontSize: 13.5 }}>
        {children}
      </Text>
    </Pressable>
  );
}

export function GhostButton({ onPress, disabled, children, icon: Icon, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: radii.md,
          backgroundColor: pressed ? colors.surface2 : 'transparent',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
          opacity: disabled ? 0.4 : 1,
          gap: 8,
        },
        style,
      ]}
    >
      {Icon && <Icon size={14} color={colors.textSecondary} strokeWidth={1.75} />}
      <Text style={{ ...type.title, color: colors.textPrimary, fontSize: 13 }}>{children}</Text>
    </Pressable>
  );
}

/* ============================================================
   PROGRESS — indeterminate sweep
   ============================================================ */
export function ProgressSweep() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1400, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <View style={{ height: 2, borderRadius: 999, backgroundColor: colors.surface3, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height: 2,
          width: '32%',
          borderRadius: 999,
          backgroundColor: colors.accentCyan,
          transform: [{
            translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-120, 400] }),
          }],
        }}
      />
    </View>
  );
}

/* ============================================================
   KEY / VALUE TILE
   ============================================================ */
export function StatTile({ label, value, hint }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.line,
        borderRadius: radii.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flex: 1,
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <Text style={{ ...type.display, color: colors.textPrimary, fontSize: 20, marginTop: 4 }}>{value}</Text>
      {!!hint && (
        <Text style={{ ...type.mono, color: colors.textTertiary, fontSize: 10.5, marginTop: 2 }}>{hint}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  markRow: { flexDirection: 'row', alignItems: 'center' },
});
