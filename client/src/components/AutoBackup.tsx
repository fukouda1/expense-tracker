import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as repo from '../local/repository';
import { useToast } from './Toast';

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

/** Generate XLSX backup on native using local SQLite data */
async function nativeBackup(): Promise<boolean> {
  try {
    const XLSX = await import('xlsx');
    const { utils, write } = XLSX;
    const wb = utils.book_new();

    const accs = await repo.getAllAccounts();
    utils.book_append_sheet(wb, utils.json_to_sheet(accs.map(a => ({
      ID: a.id, NAME: a.name, ICON: a.icon, COLOR: a.color, INITIAL_BALANCE: a.initial_balance,
    }))), 'Accounts');

    const cats = await repo.getAllCategories();
    utils.book_append_sheet(wb, utils.json_to_sheet(cats.map(c => ({
      ID: c.id, NAME: c.name, ICON: c.icon, COLOR: c.color, TYPE: c.type,
    }))), 'Categories');

    const tgs = await repo.getAllTags();
    utils.book_append_sheet(wb, utils.json_to_sheet(tgs.length ? tgs.map(t => ({
      ID: t.id, NAME: t.name, COLOR: t.color,
    })) : [{ ID: '', NAME: '', COLOR: '' }]), 'Tags');

    const allTx = await repo.getTransactionsByDateRange('2000-01-01', '2099-12-31T23:59:59');
    utils.book_append_sheet(wb, utils.json_to_sheet(allTx.sort((a, b) => a.date.localeCompare(b.date)).map(t => ({
      ID: t.id, DATE: t.date, TYPE: t.type, AMOUNT: t.amount,
      CATEGORY: t.category_name ?? '', ACCOUNT: t.account_name ?? '',
      TO_ACCOUNT: t.to_account_name ?? '', NOTES: t.notes ?? '', TAGS: '',
    }))), 'Transactions');

    // Include settled debts
    try {
      const dismissed = JSON.parse(localStorage.getItem('tracecash_dismissed_debts') || '[]') as string[];
      if (dismissed.length) utils.book_append_sheet(wb, utils.json_to_sheet(dismissed.map(k => ({ KEY: k }))), 'SettledDebts');
    } catch { /* ignore */ }

    // Include templates
    try {
      const templates = JSON.parse(localStorage.getItem('tracecash_templates_v2') || '[]');
      if (templates.length) utils.book_append_sheet(wb, utils.json_to_sheet([{ DATA: JSON.stringify(templates) }]), 'Templates');
    } catch { /* ignore */ }

    const base64 = write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileName = `tracecash_autobackup_${new Date().toISOString().slice(0, 10)}.xlsx`;
    // Save to cache then share — user picks Downloads/Drive/etc
    const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: fileName, url: written.uri, dialogTitle: `Save backup: ${fileName}` });
    } catch { /* user cancelled — file still in cache */ }
    return true;
  } catch (e) {
    console.error('Native auto-backup failed:', e);
    return false;
  }
}

/** Trigger an xlsx backup download (web) or save to Documents (native) */
async function downloadBackup(): Promise<boolean> {
  if (isNative) return nativeBackup();
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
 * if the last backup was more than 7 days ago, triggers a backup.
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
  const [backing, setBacking] = useState(false);
  const { showToast } = useToast();

  const handleToggle = () => {
    const updated: AutoBackupSettings = {
      ...settings,
      enabled: !settings.enabled,
    };
    saveSettings(updated);
    setSettings(updated);
  };

  const handleBackupNow = async () => {
    setBacking(true);
    const success = await downloadBackup();
    if (success) {
      const updated: AutoBackupSettings = {
        ...settings,
        lastBackup: new Date().toISOString(),
      };
      saveSettings(updated);
      setSettings(updated);
      showToast(isNative ? 'Backup saved to Downloads' : 'Backup downloaded', 'success');
    } else {
      showToast('Backup failed', 'error');
    }
    setBacking(false);
  };

  const lastBackupDisplay = settings.lastBackup
    ? new Date(settings.lastBackup).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Never';

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
        {isNative
          ? 'Opens save dialog every 7 days — save to Downloads or Google Drive for safe backup'
          : 'Auto-downloads .xlsx backup every 7 days when you open the app'}
      </p>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Last backup: {lastBackupDisplay}
        </p>
        <button
          onClick={handleBackupNow}
          disabled={backing}
          className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          {backing ? 'Saving...' : 'Backup now'}
        </button>
      </div>
    </div>
  );
}
