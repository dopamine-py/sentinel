// First-launch onboarding.
//
// The full cinematic 60-second demo is BUNDLED into the app as a single
// self-contained HTML string (src/demoHtml.js, generated from the
// sentinel-demo-static project). It's loaded into a WebView from local
// memory — no hosting, no network, works offline on every installed APK.
//
// If the WebView fails for any reason, a clean native intro renders so the
// app never opens to a blank screen. Either path marks onboarding as seen
// and continues to MainTabs.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text, Platform, ActivityIndicator,
  Animated, Easing, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Radio, ShieldCheck, Brain, Workflow, Activity, Sparkles } from 'lucide-react-native';
import { colors, fonts, radii, spacing, type as typeStyle } from '../ui/theme';
import { SentinelMark, PulseDot } from '../ui/primitives';
import DemoSurface from '../ui/DemoSurface';
import demoHtml from '../demoHtml';

const LOAD_TIMEOUT_MS = 4000;        // local HTML loads fast; safety net only
const AUTO_ADVANCE_MS = 65000;       // after demo length, auto-show CTA

export default function OnboardingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  // Demo is bundled — start in 'loading' and flip to 'demo' on WebView ready.
  const [phase, setPhase] = useState('loading'); // 'loading' | 'demo' | 'native' | 'cta'
  const timeoutRef = useRef(null);
  const ctaTimeoutRef = useRef(null);

  // Safety net — if the WebView never fires onLoadEnd, drop to native intro.
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setPhase((p) => (p === 'loading' ? 'native' : p));
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (ctaTimeoutRef.current) clearTimeout(ctaTimeoutRef.current);
    };
  }, []);

  // When the demo phase starts playing, also queue the CTA after demo length
  useEffect(() => {
    if (phase === 'demo') {
      ctaTimeoutRef.current = setTimeout(() => {
        setPhase('cta');
      }, AUTO_ADVANCE_MS);
    }
    return () => {
      if (ctaTimeoutRef.current) clearTimeout(ctaTimeoutRef.current);
    };
  }, [phase]);

  // Idempotent — the in-demo button, native overlay, WebView bridge and the
  // auto-CTA can all call this; only the first wins.
  const doneRef = useRef(false);
  const completeOnboarding = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    } catch {}
    // reset (not replace) so the stack is cleared and the demo can't be
    // returned to with the back gesture.
    try {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch {
      try { navigation.replace('MainTabs'); } catch {}
    }
  };

  const onWebLoadEnd = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (phase === 'loading') setPhase('demo');
  };

  const onWebError = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPhase('native');
  };

  return (
    <View style={styles.container}>
      {phase !== 'native' && (
        <View style={{ flex: 1 }}>
          {/* Native top action bar. This is a LAYOUT SIBLING above the
              WebView (its own touch region) — not an absolute overlay —
              so the tap always lands on RN and never gets swallowed by
              the Android WebView. Zero dependence on the WebView→RN
              bridge or the demo's internal state. */}
          <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
            <SentinelMark size="sm" />
            <Pressable
              onPress={completeOnboarding}
              hitSlop={14}
              style={({ pressed }) => [styles.goConsoleBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.goConsoleText}>Go to console</Text>
              <ArrowRight size={13} color="#0a0b0d" strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Demo fills the remaining space. WebView on native, iframe on web. */}
          <View style={[styles.webview, phase === 'loading' ? { opacity: 0 } : { opacity: 1 }]}>
            <DemoSurface
              html={demoHtml}
              hidden={phase === 'loading'}
              onReady={onWebLoadEnd}
              onFail={onWebError}
              onMessage={(e) => {
                // Backup path — the in-demo button may also postMessage('skip').
                if (e?.nativeEvent?.data === 'skip') completeOnboarding();
              }}
            />
          </View>
        </View>
      )}

      {/* Loading overlay — covers the demo area until the WebView paints */}
      {phase === 'loading' && (
        <View style={styles.loaderOverlay} pointerEvents="none">
          <View style={styles.loaderInner}>
            <SentinelMark size="lg" />
            <ActivityIndicator size="small" color={colors.accentCyan} style={{ marginTop: 20 }} />
            <Text style={styles.loaderText}>Preparing your console…</Text>
          </View>
        </View>
      )}

      {/* When demo length elapses, surface the big primary CTA at the bottom */}
      {phase === 'cta' && (
        <View pointerEvents="box-none" style={styles.ctaOverlay}>
          <Pressable onPress={completeOnboarding} style={styles.primaryCta}>
            <Text style={styles.primaryCtaText}>Enter the console</Text>
            <ArrowRight size={14} color="#0a0b0d" strokeWidth={2.5} />
          </Pressable>
        </View>
      )}

      {/* Native fallback — beautiful intro when the WebView can't load */}
      {phase === 'native' && <NativeIntro onContinue={completeOnboarding} />}
    </View>
  );
}

/* ============================================================
   Native fallback intro
   ============================================================ */
function NativeIntro({ onContinue }) {
  // Stagger the value props in with a soft fade-up
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide,   { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [opacity, slide]);

  const items = [
    { icon: Radio,      title: 'Stream the city',  body: 'Citizen reports, weather, traffic and sensors merge into one observable feed.' },
    { icon: ShieldCheck,title: 'Verify the signal',body: 'Six agents cross-check evidence, score trust, and surface only what matters.' },
    { icon: Brain,      title: 'Decide and act',   body: 'A live plan dispatches across radio, SMS, traffic and SCADA in seconds.' },
    { icon: Activity,   title: 'Adapt on the fly', body: 'Outcomes are monitored against reality — and the plan revises itself.' },
  ];

  return (
    <View style={styles.nativeFill}>
      {/* Subtle grid + radial glow */}
      <View style={styles.grid} pointerEvents="none" />
      <View style={styles.glow} pointerEvents="none" />

      <Animated.View
        style={[
          styles.nativeInner,
          { opacity, transform: [{ translateY: slide }] },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SentinelMark size="md" />
          <View style={styles.livePill}>
            <PulseDot color={colors.accentCyan} size={5} />
            <Text style={styles.livePillText}>WELCOME</Text>
          </View>
        </View>

        <Text style={styles.headline}>
          Autonomous crisis{'\n'}
          <Text style={{ color: colors.textSecondary }}>intelligence.</Text>
        </Text>

        <Text style={styles.subline}>
          For Karachi, Lahore, Multan and Islamabad — cities that can't afford to be slow.
        </Text>

        <View style={styles.valueProps}>
          {items.map((it, i) => (
            <ValueProp key={i} icon={it.icon} title={it.title} body={it.body} />
          ))}
        </View>

        <View style={{ flex: 1 }} />

        <View style={styles.ctaRow}>
          <Pressable onPress={onContinue} style={styles.primaryCta}>
            <Text style={styles.primaryCtaText}>Enter the console</Text>
            <ArrowRight size={14} color="#0a0b0d" strokeWidth={2.5} />
          </Pressable>
          <Text style={styles.footerNote}>You can revisit this intro in Settings.</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function ValueProp({ icon: Icon, title, body }) {
  return (
    <View style={styles.vpRow}>
      <View style={styles.vpIconWrap}>
        <Icon size={14} color={colors.accentCyan} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.vpTitle}>{title}</Text>
        <Text style={styles.vpBody}>{body}</Text>
      </View>
    </View>
  );
}

/* ============================================================ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface0 },
  webview:   { flex: 1, backgroundColor: 'transparent' },

  // Native action bar — a real layout row above the WebView (not an
  // overlay), so its button always receives taps on Android.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 28,
    paddingBottom: 12,
    paddingHorizontal: 18,
    backgroundColor: colors.surface0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    zIndex: 2,
  },

  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  loaderInner: { alignItems: 'center' },
  loaderText: {
    color: colors.textSecondary,
    marginTop: 14,
    fontFamily: fonts.sans,
    fontSize: 13,
    letterSpacing: 0.2,
  },

  goConsoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: '#e8e9eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 24,
  },
  goConsoleText: {
    color: '#0a0b0d',
    fontSize: 13,
    fontFamily: fonts.sansMedium,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  ctaOverlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    zIndex: 8,
  },
  ctaRow: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: radii.md,
    shadowColor: colors.accentCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 4,
  },
  primaryCtaText: {
    color: '#0a0b0d',
    fontFamily: fonts.sansMedium,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.1,
  },

  /* Native fallback */
  nativeFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface0,
    zIndex: 9,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
    // Faux grid via repeating linear gradient — RN doesn't support background-image,
    // so we approximate with two thin lines via overlay views in render if needed.
  },
  glow: {
    position: 'absolute',
    top: -120, left: -60, right: -60, height: 360,
    backgroundColor: 'rgba(103, 232, 249, 0.05)',
    opacity: 0.9,
    transform: [{ scaleX: 1.5 }],
  },
  nativeInner: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 76 : 52,
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },

  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(103, 232, 249, 0.25)',
    backgroundColor: 'rgba(103, 232, 249, 0.08)',
  },
  livePillText: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.accentCyan,
    letterSpacing: 1.3,
  },

  headline: {
    marginTop: 28,
    fontFamily: fonts.sansMedium,
    fontWeight: '700',
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.2,
    color: colors.textPrimary,
  },
  subline: {
    marginTop: 14,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    maxWidth: 360,
  },

  valueProps: {
    marginTop: 36,
    gap: 14,
  },
  vpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  vpIconWrap: {
    width: 28, height: 28, borderRadius: radii.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: 'rgba(103, 232, 249, 0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  vpTitle: {
    fontFamily: fonts.sansMedium,
    fontWeight: '600',
    fontSize: 13.5,
    color: colors.textPrimary,
    letterSpacing: -0.1,
  },
  vpBody: {
    marginTop: 3,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },

  footerNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.4,
  },
});

/* satisfy unused-symbol lint */
void typeStyle;
void Workflow;
void Sparkles;
void spacing;
