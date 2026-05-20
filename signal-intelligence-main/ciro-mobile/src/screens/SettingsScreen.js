// Settings — backend URL, role, notifications, build info.
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Switch, ScrollView, TextInput,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { CheckCircle2, RefreshCw, Wifi, WifiOff, Trash2, Play } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiBase, getDefaultApiBase, setApiBase, loadApiBase, isBackendOnline } from '../api';
import {
  SentinelMark, Card, Eyebrow, PrimaryButton, GhostButton, StatusPill,
} from '../ui/primitives';
import { colors, radii, spacing, type } from '../ui/theme';

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const replayIntro = async () => {
    try {
      await AsyncStorage.removeItem('hasSeenOnboarding');
    } catch {}
    // 'Onboarding' lives on the root stack; React Navigation resolves it
    // up the tree from this tab screen.
    try {
      navigation.navigate('Onboarding');
    } catch {
      Alert.alert('Replay intro', 'Restart the app to see the intro again.');
    }
  };

  const [apiUrl, setApiUrl] = useState('');
  const [defaultApi] = useState(getDefaultApiBase());
  const [notif, setNotif] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState(null);

  useEffect(() => {
    (async () => {
      const base = await loadApiBase();
      setApiUrl(base);
    })();
  }, []);

  const probe = async () => {
    setProbing(true);
    setProbeResult(null);
    try {
      // Set first so isBackendOnline uses the latest value
      await setApiBase(apiUrl || '');
      const ok = await isBackendOnline();
      setProbeResult(ok ? 'online' : 'offline');
    } finally {
      setProbing(false);
    }
  };

  const save = async () => {
    await setApiBase(apiUrl || '');
    Alert.alert('Saved', 'API base updated.');
  };

  const reset = async () => {
    await setApiBase('');
    setApiUrl(getDefaultApiBase());
    Alert.alert('Reset', 'API base reverted to default.');
  };

  const testNotification = async () => {
    try {
      const settings = await Notifications.getPermissionsAsync();
      if (!settings.granted) {
        const req = await Notifications.requestPermissionsAsync();
        if (!req.granted) {
          Alert.alert('Notifications', 'Permission denied. Enable in Android settings.');
          return;
        }
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Sentinel · test alert',
          body: 'You’ll see this for live, high-severity incidents.',
          data: { test: true },
          color: '#F5402C',
        },
        trigger: null,
      });
    } catch (e) {
      Alert.alert('Notification failed', String(e && e.message));
    }
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: spacing(8) }}>
      <View style={[s.headerRow, { paddingTop: insets.top + spacing(2) }]}>
        <SentinelMark />
        <StatusPill state="online" label={`v ${require('../../package.json').version || '1.0.0'}`} />
      </View>

      {/* Backend */}
      <Card style={cardMx}>
        <Eyebrow>Backend</Eyebrow>
        <Text style={{ ...type.title, fontSize: 15, color: colors.textPrimary, marginTop: 4 }}>
          API endpoint
        </Text>
        <Text style={{ ...type.body, fontSize: 12.5, color: colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
          The FastAPI host for the signal-intelligence pipeline. Defaults to the
          hosted backend so the app works out of the box. Point it at{' '}
          <Text style={{ ...type.mono, color: colors.textPrimary }}>:8000</Text> (or your LAN IP)
          to run against a local backend.
        </Text>

        <TextInput
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder={defaultApi}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={s.input}
        />
        <Text style={{ ...type.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 6 }}>
          default: {defaultApi}
        </Text>

        {probeResult && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
            {probeResult === 'online'
              ? <Wifi size={14} color={colors.statusOk} />
              : <WifiOff size={14} color={colors.statusWarn} />}
            <Text style={{ ...type.mono, fontSize: 11, color: probeResult === 'online' ? colors.statusOk : colors.statusWarn }}>
              {probeResult === 'online' ? 'Backend reachable.' : 'Backend unreachable from this host.'}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <GhostButton onPress={probe} icon={probing ? RefreshCw : Wifi} disabled={probing} style={{ flex: 1 }}>
            {probing ? 'Probing…' : 'Test connection'}
          </GhostButton>
          <PrimaryButton onPress={save} icon={CheckCircle2} style={{ flex: 1 }}>Save</PrimaryButton>
        </View>
        <TouchableOpacity onPress={reset} activeOpacity={0.7} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Trash2 size={12} color={colors.textTertiary} />
          <Text style={{ ...type.mono, fontSize: 11, color: colors.textTertiary }}>reset to default</Text>
        </TouchableOpacity>
      </Card>

      {/* Notifications */}
      <Card style={[cardMx, { marginTop: spacing(3) }]}>
        <Eyebrow>Notifications</Eyebrow>
        <Text style={{ ...type.title, fontSize: 15, color: colors.textPrimary, marginTop: 4 }}>
          Push severity
        </Text>
        <View style={{ marginTop: 8 }}>
          <ToggleRow
            label="Critical incidents · always"
            desc="Floods, MVCs, infrastructure failure."
            on={notif}
            onChange={setNotif}
          />
          <ToggleRow
            label="Haptic on dispatch"
            desc="Subtle vibration when a plan goes live."
            on={haptics}
            onChange={setHaptics}
          />
        </View>
        <GhostButton onPress={testNotification} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
          Send test alert
        </GhostButton>
      </Card>

      {/* Intro */}
      <Card style={[cardMx, { marginTop: spacing(3) }]}>
        <Eyebrow>Intro</Eyebrow>
        <Text style={{ ...type.title, fontSize: 15, color: colors.textPrimary, marginTop: 4 }}>
          Replay the cinematic demo
        </Text>
        <Text style={{ ...type.body, fontSize: 12.5, color: colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
          Watch the 60-second Sentinel intro again — the one shown on first launch.
        </Text>
        <GhostButton onPress={replayIntro} icon={Play} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
          Replay intro
        </GhostButton>
      </Card>

      {/* Build info */}
      <Card style={[cardMx, { marginTop: spacing(3) }]}>
        <Eyebrow>Build</Eyebrow>
        <View style={{ marginTop: 8, gap: 6 }}>
          <Row label="Platform"   value={Platform.OS.toUpperCase()} />
          <Row label="App version" value={String(require('../../package.json').version || '1.0.0')} />
          <Row label="Pipeline"    value="6-agent CIRO" />
        </View>
      </Card>
    </ScrollView>
  );
}

function ToggleRow({ label, desc, on, onChange }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surface2,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
      paddingHorizontal: 12, paddingVertical: 10,
      marginBottom: 6,
    }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...type.title, fontSize: 13, color: colors.textPrimary }}>{label}</Text>
        <Text style={{ ...type.body, fontSize: 11.5, color: colors.textTertiary, marginTop: 2 }}>{desc}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ false: colors.surface3, true: colors.accentCyanSoft }}
        thumbColor={on ? colors.accentCyan : colors.textSecondary}
      />
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ ...type.mono, fontSize: 11, color: colors.textTertiary }}>{label}</Text>
      <Text style={{ ...type.mono, fontSize: 11, color: colors.textSecondary }}>{value}</Text>
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
  input: {
    marginTop: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 10, paddingVertical: 10,
    color: colors.textPrimary,
    ...type.mono, fontSize: 12.5,
  },
});
