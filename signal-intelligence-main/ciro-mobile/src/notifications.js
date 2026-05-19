import * as Notifications from 'expo-notifications';
import { runLiveScan } from './api';

const ACCENT = '#67e8f9';
const OK     = '#34d399';

// Foreground display config
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermission() {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Fire a crisis alert. Backwards-compatible — accepts either:
 *   sendCrisisAlert({ runId, title, body, location })
 *   sendCrisisAlert(crisisObject, runId)
 */
export async function sendCrisisAlert(arg1, arg2) {
  let runId, title, body;

  if (arg1 && typeof arg1 === 'object' && (arg1.title || arg1.runId)) {
    runId = arg1.runId;
    title = arg1.title || 'Sentinel · incident';
    body  = arg1.body || arg1.location || '';
  } else if (arg1 && typeof arg1 === 'object') {
    const crisis = arg1;
    runId = arg2;
    const typeLabel = (crisis.crisis_type || 'incident')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    title = `Sentinel · ${typeLabel}`;
    body  = `${crisis.location || ''} · ${String(crisis.severity || '').toUpperCase()}\n${(crisis.description || '').slice(0, 100)}`;
  } else {
    title = 'Sentinel · incident';
    body  = '';
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { runId },
      color: ACCENT,
      priority: 'max',
      sound: true,
    },
    trigger: null,
  });
}

export async function sendClearNotification() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sentinel · all clear',
      body: 'Live scan complete. No urban crisis detected.',
      color: OK,
    },
    trigger: null,
  });
}

// Foreground polling — wake every 5 min and run a live scan.
let _pollingInterval = null;
let _lastCrisisRunId = null;

export function startPolling(onCrisisFound) {
  if (_pollingInterval) return;
  _pollingInterval = setInterval(async () => {
    try {
      const result = await runLiveScan();
      if (result?.status === 'success' && result?.data?.detected_crisis) {
        const { run_id, detected_crisis } = result.data;
        if (run_id !== _lastCrisisRunId) {
          _lastCrisisRunId = run_id;
          await sendCrisisAlert(detected_crisis, run_id);
          onCrisisFound?.(result.data);
        }
      }
    } catch (_) {}
  }, 5 * 60 * 1000);
}

export function stopPolling() {
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
    _pollingInterval = null;
  }
}

export function addNotificationListener(handler) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    handler?.(data);
  });
}
