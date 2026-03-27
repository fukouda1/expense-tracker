import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'tracecash_auto_backup';
const isNative = Capacitor.isNativePlatform();

interface AutoBackupSettings {
  enabled: boolean;
  lastBackup: string; // ISO date string
}

function getSettings(): AutoBackupSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { enabled: false, lastBackup: '' };
}

function saveSettings(settings: AutoBackupSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Trigger an xlsx backup download (web only) */
async function downloadBackup(): Promise<boolean> {
  if (isNative) return false; // No Express server in APK mode
  try {
    const response = await fetch('/api/export/xlsx');
    if (!response.ok) return false;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracecash_autobackup_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    console.error('Auto-backup download failed');
    return false;
  }
}

/**
 * Hook to run on app load. Checks if auto-backup is enabled and
 * if the last backup was more than 7 days ago, triggers a download.
 */
export function useAutoBackupCheck(): void {
  useEffect(() => {
    const settings = getSettings();
    if (!settings.enabled) return;

    const now = new Date();
    const last = settings.lastBackup ? new Date(settings.lastBackup) : null;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (!last || now.getTime() - last.getTime() > sevenDays) {
      downloadBackup().then(success => {
        if (success) {
          saveSettings({ ...settings, lastBackup: now.toISOString() });
        }
      });
    }
  }, []);
}

/**
 * Settings toggle component for the General tab in Settings page.
 */
export default function AutoBackupToggle() {
  const [settings, setSettings] = useState<AutoBackupSettings>(getSettings);

  const handleToggle = () => {
    const updated: AutoBackupSettings = {
      ...settings,
      enabled: !settings.enabled,
    };
    saveSettings(updated);
    setSettings(updated);
  };

  const handleBackupNow = async () => {
    const success = await downloadBackup();
    if (success) {
      const updated: AutoBackupSettings = {
        ...settings,
        lastBackup: new Date().toISOString(),
      };
      saveSettings(updated);
      setSettings(updated);
    }
  };

  const lastBackupDisplay = settings.lastBackup
    ? new Date(settings.lastBackup).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Never';

  if (isNative) return null; // Auto-backup requires Express server — web only

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-backup (weekly)</p>
        <button
          onClick={handleToggle}
          className={`w-12 h-6 rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
        Automatically downloads an .xlsx backup every 7 days when you open the app
      </p>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Last backup: {lastBackupDisplay}
        </p>
        <button
          onClick={handleBackupNow}
          className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Backup now
        </button>
      </div>
    </div>
  );
}
