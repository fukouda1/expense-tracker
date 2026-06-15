/**
 * Local notifications wrapper.
 *
 * Two triggers:
 *   1. Daily log reminder — fires at user's chosen time, every day. ID = 1.
 *   2. Recurring-due reminders — one-shot per upcoming recurring entry,
 *      fires at 09:00 on next_date. ID = 10000 + recurring.id.
 *
 * Web mode: every function is a safe no-op (plugin only works on native).
 * Settings keys live in localStorage so they round-trip via backupSheets.ts.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { RecurringTransaction } from '../types';

const isNative = Capacitor.isNativePlatform();

// localStorage keys (round-tripped via backupSheets.ts → Notifications sheet)
export const KEY_DAILY_ENABLED = 'tracecash_notif_daily_enabled';
export const KEY_DAILY_TIME = 'tracecash_notif_daily_time';
export const KEY_RECURRING_ENABLED = 'tracecash_notif_recurring_enabled';

const DAILY_ID = 1;
const RECURRING_BASE_ID = 10000;

/** Read settings — defaults are off. */
export function getNotifSettings() {
  return {
    dailyEnabled: localStorage.getItem(KEY_DAILY_ENABLED) === '1',
    dailyTime: localStorage.getItem(KEY_DAILY_TIME) || '21:00',
    recurringEnabled: localStorage.getItem(KEY_RECURRING_ENABLED) === '1',
  };
}

export function setNotifSettings(s: Partial<{ dailyEnabled: boolean; dailyTime: string; recurringEnabled: boolean }>) {
  if (s.dailyEnabled != null) localStorage.setItem(KEY_DAILY_ENABLED, s.dailyEnabled ? '1' : '0');
  if (s.dailyTime != null) localStorage.setItem(KEY_DAILY_TIME, s.dailyTime);
  if (s.recurringEnabled != null) localStorage.setItem(KEY_RECURRING_ENABLED, s.recurringEnabled ? '1' : '0');
}

/** Ask for notification permission. Returns true if granted. No-op + true on web. */
export async function ensureNotifPermission(): Promise<boolean> {
  if (!isNative) return true;
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === 'granted') return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch (e) {
    console.warn('Notification permission check failed', e);
    return false;
  }
}

/** Cancel a notification by id. Safe to call when not scheduled. */
async function cancelById(id: number): Promise<void> {
  if (!isNative) return;
  try { await LocalNotifications.cancel({ notifications: [{ id }] }); } catch { /* ignore */ }
}

/**
 * Schedule (or reschedule) the repeating daily log reminder.
 * Cancels first to avoid stacking duplicates after a time change.
 */
export async function scheduleDailyReminder(): Promise<void> {
  if (!isNative) return;
  await cancelById(DAILY_ID);
  const { dailyEnabled, dailyTime } = getNotifSettings();
  if (!dailyEnabled) return;
  const [h, m] = dailyTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: DAILY_ID,
        title: 'Log today\'s expenses',
        body: 'Tap to add what you spent today.',
        schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
        extra: { deepLink: '/add' },
      }],
    });
  } catch (e) {
    console.warn('scheduleDailyReminder failed', e);
  }
}

/**
 * Schedule one-shot reminders at 09:00 for every recurring transaction whose
 * next_date is in the future (window: next 30 days). Past-dated entries are
 * shown by RecurringPreview on Dashboard so no notification needed there.
 * Always cancels all recurring IDs first to clear stale schedules.
 */
export async function scheduleRecurringReminders(recurring: RecurringTransaction[]): Promise<void> {
  if (!isNative) return;
  // Always cancel known recurring IDs (cheap; safe if not scheduled)
  try {
    const all = recurring.map(r => ({ id: RECURRING_BASE_ID + r.id }));
    if (all.length) await LocalNotifications.cancel({ notifications: all });
  } catch { /* ignore */ }

  const { recurringEnabled } = getNotifSettings();
  if (!recurringEnabled) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 30);

  const toSchedule = recurring.filter(r => {
    if (!r.active) return false;
    const d = new Date(r.next_date);
    return d >= today && d <= horizon;
  });

  if (toSchedule.length === 0) return;

  try {
    await LocalNotifications.schedule({
      notifications: toSchedule.map(r => {
        const d = new Date(r.next_date);
        d.setHours(9, 0, 0, 0);
        return {
          id: RECURRING_BASE_ID + r.id,
          title: `Recurring due: ${r.notes || r.category_name || 'transaction'}`,
          body: r.auto_create
            ? `${r.amount > 0 ? '₱' + r.amount : 'Entry'} will post today.`
            : `Reminder — log this if it actually happened.`,
          schedule: { at: d, allowWhileIdle: true },
          extra: { deepLink: '/', recurringId: r.id },
        };
      }),
    });
  } catch (e) {
    console.warn('scheduleRecurringReminders failed', e);
  }
}

/** Wire deep-link taps to the router. Call once on app mount. */
export function attachNotifTapListener(navigate: (path: string) => void): () => void {
  if (!isNative) return () => {};
  let handle: { remove: () => Promise<void> } | null = null;
  LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const link = (e.notification?.extra as { deepLink?: string } | undefined)?.deepLink;
    if (link) navigate(link);
  }).then(h => { handle = h; }).catch(() => { /* ignore */ });
  return () => { handle?.remove().catch(() => {}); };
}
