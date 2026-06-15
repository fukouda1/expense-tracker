/**
 * Settings card for local notifications (daily log reminder + recurring-due reminders).
 * Native-only; on web the toggles still flip localStorage so settings round-trip
 * via backup export, but no notification is actually scheduled.
 */
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useData } from '../contexts/DataContext';
import {
  getNotifSettings,
  setNotifSettings,
  ensureNotifPermission,
  scheduleDailyReminder,
  scheduleRecurringReminders,
} from '../utils/notifications';

const isNative = Capacitor.isNativePlatform();

export default function NotificationSettings() {
  const { recurring } = useData();
  const initial = getNotifSettings();
  const [dailyEnabled, setDailyEnabled] = useState(initial.dailyEnabled);
  const [dailyTime, setDailyTime] = useState(initial.dailyTime);
  const [recurringEnabled, setRecurringEnabled] = useState(initial.recurringEnabled);
  const [denied, setDenied] = useState(false);

  // Reschedule whenever any value changes.
  useEffect(() => {
    setNotifSettings({ dailyEnabled, dailyTime, recurringEnabled });
    scheduleDailyReminder();
    scheduleRecurringReminders(recurring);
  }, [dailyEnabled, dailyTime, recurringEnabled, recurring]);

  const onToggleDaily = async (next: boolean) => {
    if (next && isNative) {
      const ok = await ensureNotifPermission();
      if (!ok) { setDenied(true); return; }
    }
    setDenied(false);
    setDailyEnabled(next);
  };

  const onToggleRecurring = async (next: boolean) => {
    if (next && isNative) {
      const ok = await ensureNotifPermission();
      if (!ok) { setDenied(true); return; }
    }
    setDenied(false);
    setRecurringEnabled(next);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">🔔 Notifications</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {isNative
            ? 'Local reminders on this device. No internet, no account needed.'
            : 'These toggles save with your backup but only fire on the Android app.'}
        </p>
      </div>

      {/* Daily log reminder */}
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900 dark:text-white">Daily log reminder</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Nudge me at a fixed time each day to log expenses.</div>
        </div>
        <input type="checkbox" checked={dailyEnabled} onChange={e => onToggleDaily(e.target.checked)}
          className="h-5 w-5 accent-emerald-500" />
      </label>
      {dailyEnabled && (
        <div className="flex items-center gap-2 pl-1">
          <label className="text-xs text-gray-600 dark:text-gray-400">Time</label>
          <input type="time" value={dailyTime} onChange={e => setDailyTime(e.target.value)}
            className="text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-900 dark:text-white" />
        </div>
      )}

      {/* Recurring due */}
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900 dark:text-white">Recurring due reminders</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Notify me at 9 AM on the day a recurring transaction is due.</div>
        </div>
        <input type="checkbox" checked={recurringEnabled} onChange={e => onToggleRecurring(e.target.checked)}
          className="h-5 w-5 accent-emerald-500" />
      </label>

      {denied && (
        <p className="text-xs text-red-500">Permission denied. Enable notifications for TraceCash in Android settings.</p>
      )}
    </div>
  );
}
