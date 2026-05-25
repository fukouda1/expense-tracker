import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import * as repo from '../local/repository';
import { appendBackupSheets } from '../utils/backupSheets';
import { useToast } from './Toast';

const STORAGE_KEY = 'tracecash_auto_backup';
const isNative = Capacitor.isNativePlatform();

interface AutoBackupSettings {
  enabled: boolean;
  autoShare: boolean;       // when true, the weekly auto-backup also opens the share sheet
  lastBackup: string;       // ISO date string
  lastBackupUri?: string;   // most recent backup file URI (for re-sharing later)
  lastBackupName?: string;
}

function getSettings(): AutoBackupSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { autoShare: false, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { enabled: false, autoShare: false, lastBackup: '' };
}

function saveSettings(settings: AutoBackupSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface BackupResult { ok: boolean; uri?: string; fileName?: string }

/** Generate XLSX backup on native using local SQLite data. Returns the file URI on success. */
async function nativeBackup(): Promise<BackupResult> {
  try {
    const XLSX = await import('xlsx');
    const { utils, write } = XLSX;
    const wb = utils.book_new();

    const accs = await repo.getAllAccounts();
    utils.book_append_sheet(wb, utils.json_to_sheet(accs.map(a => ({
      ID: a.id, NAME: a.name, ICON: a.icon, COLOR: a.color, INITIAL_BALANCE: a.initial_balance,
      SORT_ORDER: a.sort_order ?? 0, ACTIVE: a.active ? 'Yes' : 'No',
    }))), 'Accounts');

    const cats = await repo.getAllCategories();
    utils.book_append_sheet(wb, utils.json_to_sheet(cats.map(c => ({
      ID: c.id, NAME: c.name, ICON: c.icon, COLOR: c.color, TYPE: c.type,
      SORT_ORDER: c.sort_order ?? 0, ACTIVE: c.active ? 'Yes' : 'No',
    }))), 'Categories');

    const tgs = await repo.getAllTags();
    utils.book_append_sheet(wb, utils.json_to_sheet(tgs.length ? tgs.map(t => ({
      ID: t.id, NAME: t.name, COLOR: t.color, SORT_ORDER: t.sort_order ?? 0, ACTIVE: t.active ? 'Yes' : 'No',
    })) : [{ ID: '', NAME: '', COLOR: '' }]), 'Tags');

    // Entrusted Funds (Phase: must be in any backup off-device, otherwise the user loses these)
    const funds = await repo.getEntrustedFunds();
    const fundIdToName = new Map(funds.map(f => [f.id, f.name]));
    utils.book_append_sheet(wb, utils.json_to_sheet(funds.length ? funds.map(f => ({
      ID: f.id, NAME: f.name, TARGET_AMOUNT: f.target_amount, NOTES: f.notes,
      CLOSED: f.closed ? 'Yes' : 'No', CREATED_AT: f.created_at,
    })) : [{ ID: '', NAME: '', TARGET_AMOUNT: '', NOTES: '', CLOSED: '', CREATED_AT: '' }]), 'EntrustedFunds');

    const allTx = await repo.getTransactionsByDateRange('2000-01-01', '2099-12-31T23:59:59');
    utils.book_append_sheet(wb, utils.json_to_sheet(allTx.sort((a, b) => a.date.localeCompare(b.date)).map(t => ({
      ID: t.id, DATE: t.date, TYPE: t.type, AMOUNT: t.amount,
      CATEGORY: t.category_name ?? '', ACCOUNT: t.account_name ?? '',
      TO_ACCOUNT: t.to_account_name ?? '', NOTES: t.notes ?? '', TAGS: '',
      ENTRUSTED_FUND: t.entrusted_fund_id != null ? (fundIdToName.get(t.entrusted_fund_id) ?? '') : '',
    }))), 'Transactions');

    // All localStorage-backed sheets (Templates, SettledDebts, SettledBalancing, PinLock, AutoBackup, Receipts)
    await appendBackupSheets(wb, utils);

    const base64 = write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileName = `tracecash_autobackup_${new Date().toISOString().slice(0, 10)}.xlsx`;
    let uri: string | undefined;
    try {
      const res = await Filesystem.writeFile({ path: `TraceCash/${fileName}`, data: base64, directory: Directory.External, recursive: true });
      uri = res.uri;
    } catch { /* may fail */ }
    return { ok: true, uri, fileName };
  } catch (e) {
    console.error('Native auto-backup failed:', e);
    return { ok: false };
  }
}

/** Trigger an xlsx backup download (web) or save to Documents (native). */
async function downloadBackup(): Promise<BackupResult> {
  if (isNative) return nativeBackup();
  try {
    const XLSX = await import('xlsx');
    const response = await fetch('/api/export/xlsx');
    if (!response.ok) return { ok: false };
    const buf = await response.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    // Append localStorage-backed sheets so the web backup matches Settings → Export.
    await appendBackupSheets(wb, XLSX.utils);
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const fileName = `tracecash_autobackup_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, fileName };
  } catch {
    console.error('Auto-backup download failed');
    return { ok: false };
  }
}

/**
 * Hook to run on app load. Checks if auto-backup is enabled and
 * if the last backup was more than 7 days ago, triggers a backup.
 * When `autoShare` is on, also opens the system share sheet so the
 * user can send the file off-device (Drive / Gmail / etc.).
 */
export function useAutoBackupCheck(): void {
  useEffect(() => {
    const settings = getSettings();
    if (!settings.enabled) return;

    const now = new Date();
    const last = settings.lastBackup ? new Date(settings.lastBackup) : null;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (!last || now.getTime() - last.getTime() > sevenDays) {
      downloadBackup().then(async result => {
        if (!result.ok) return;
        saveSettings({
          ...settings,
          lastBackup: now.toISOString(),
          lastBackupUri: result.uri,
          lastBackupName: result.fileName,
        });
        // Off-device share — opens the system share sheet (Drive / Gmail / Telegram / …).
        if (settings.autoShare && isNative && result.uri) {
          try {
            await Share.share({
              title: result.fileName ?? 'TraceCash backup',
              url: result.uri,
              dialogTitle: 'Send backup off-device',
            });
          } catch { /* user cancelled — fine */ }
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
  const [sharing, setSharing] = useState(false);
  const { showToast } = useToast();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const handleToggle = () => {
    const updated: AutoBackupSettings = { ...settings, enabled: !settings.enabled };
    saveSettings(updated);
    setSettings(updated);
  };

  const handleAutoShareToggle = () => {
    const updated: AutoBackupSettings = { ...settings, autoShare: !settings.autoShare };
    saveSettings(updated);
    setSettings(updated);
  };

  const handleBackupNow = async () => {
    setBacking(true);
    const result = await downloadBackup();
    if (result.ok) {
      const updated: AutoBackupSettings = {
        ...settings,
        lastBackup: new Date().toISOString(),
        lastBackupUri: result.uri,
        lastBackupName: result.fileName,
      };
      saveSettings(updated);
      setSettings(updated);
      showToast(isNative ? 'Backup saved to TraceCash folder' : 'Backup downloaded', 'success');
    } else {
      showToast('Backup failed', 'error');
    }
    setBacking(false);
  };

  const handleShare = async () => {
    if (!settings.lastBackupUri) {
      // No backup yet — run one first, then share.
      setSharing(true);
      const result = await downloadBackup();
      setSharing(false);
      if (!result.ok || !result.uri) { showToast('Backup failed', 'error'); return; }
      const updated: AutoBackupSettings = {
        ...settings,
        lastBackup: new Date().toISOString(),
        lastBackupUri: result.uri,
        lastBackupName: result.fileName,
      };
      saveSettings(updated);
      setSettings(updated);
      try {
        await Share.share({ title: result.fileName ?? 'TraceCash backup', url: result.uri, dialogTitle: 'Send backup off-device' });
      } catch { /* user cancelled */ }
      return;
    }
    setSharing(true);
    try {
      await Share.share({
        title: settings.lastBackupName ?? 'TraceCash backup',
        url: settings.lastBackupUri,
        dialogTitle: 'Send backup off-device',
      });
    } catch { /* user cancelled */ }
    finally { setSharing(false); }
  };

  const lastBackupDisplay = settings.lastBackup
    ? new Date(settings.lastBackup).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Never';

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-backup (weekly)</p>
        <button
          onClick={handleToggle}
          className={`w-12 h-6 rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        {isNative
          ? 'Auto-saves .xlsx backup every 7 days to the TraceCash folder on this device.'
          : 'Auto-downloads .xlsx backup every 7 days when you open the app.'}
      </p>

      {isNative && (
        <div className="flex items-start justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-gray-800 dark:text-gray-200">📤 Auto-share off-device</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
              After each auto-backup, open the system share sheet so you can send the file to Drive, Gmail, etc. Avoids losing data if this device dies.
            </p>
          </div>
          <button
            onClick={handleAutoShareToggle}
            className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${settings.autoShare ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.autoShare ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Last backup: {lastBackupDisplay}
        </p>
        <div className="flex items-center gap-1.5">
          {isNative && (
            <button
              onClick={handleShare}
              disabled={sharing || backing}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-medium disabled:opacity-50"
              title="Send the latest backup to Drive / Gmail / etc."
            >
              {sharing ? 'Sharing...' : '📤 Share'}
            </button>
          )}
          <button
            onClick={handleBackupNow}
            disabled={backing || sharing}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {backing ? 'Saving...' : 'Backup now'}
          </button>
        </div>
      </div>
    </div>
  );
}
