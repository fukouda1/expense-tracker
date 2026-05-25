/**
 * Shared XLSX helpers for appending localStorage-backed sheets to an exported workbook.
 *
 * Keeps the native-mode and web-mode export paths in Settings.tsx in lock-step:
 * when you add a new localStorage-backed setting, add ONE case here and both
 * native and web exports pick it up automatically. Do the same for import in
 * applyBackupSheetsToLocalStorage below.
 */

// Typed loosely because xlsx is imported differently in native and web branches;
// both utils objects provide the same methods shape at runtime.
type XlsxUtils = {
  json_to_sheet: (data: any[]) => any;
  book_append_sheet: (wb: any, sheet: any, name: string) => void;
};

/** Append all localStorage-backed sheets to the given workbook. */
export async function appendBackupSheets(wb: any, utils: XlsxUtils): Promise<void> {
  // SettledDebts — dismissed/settled debt state
  try {
    const dismissed = JSON.parse(localStorage.getItem('tracecash_dismissed_debts') || '[]') as string[];
    if (dismissed.length) {
      utils.book_append_sheet(wb, utils.json_to_sheet(dismissed.map(k => ({ KEY: k }))), 'SettledDebts');
    }
  } catch { /* ignore */ }

  // Templates — quick templates
  try {
    const templates = JSON.parse(localStorage.getItem('tracecash_templates_v2') || '[]');
    if (templates.length) {
      utils.book_append_sheet(wb, utils.json_to_sheet([{ DATA: JSON.stringify(templates) }]), 'Templates');
    }
  } catch { /* ignore */ }

  // SettledBalancing — Reconcile entries the user accepted as-is (stable composite keys)
  try {
    const keys = JSON.parse(localStorage.getItem('tracecash_settled_balancing') || '[]') as string[];
    if (keys.length) {
      utils.book_append_sheet(wb, utils.json_to_sheet(keys.map(k => ({ KEY: k }))), 'SettledBalancing');
    }
  } catch { /* ignore */ }

  // PinLock — PIN hash + enabled + biometric flag
  try {
    const pin = localStorage.getItem('tracecash_pin');
    const pinEnabled = localStorage.getItem('tracecash_pin_enabled');
    const bio = localStorage.getItem('tracecash_biometric_enabled');
    if (pin) {
      utils.book_append_sheet(wb, utils.json_to_sheet([{ PIN: pin, ENABLED: pinEnabled, BIOMETRIC: bio }]), 'PinLock');
    }
  } catch { /* ignore */ }

  // AutoBackup — enabled + last backup timestamp
  try {
    const autoBackup = localStorage.getItem('tracecash_auto_backup');
    if (autoBackup) {
      utils.book_append_sheet(wb, utils.json_to_sheet([{ DATA: autoBackup }]), 'AutoBackup');
    }
  } catch { /* ignore */ }

  // Receipts — base64 thumbnails (resized to 200px, 50% JPEG quality)
  try {
    const receipts = JSON.parse(localStorage.getItem('tracecash_receipts') || '{}') as Record<string, string>;
    const entries = Object.entries(receipts);
    if (entries.length > 0) {
      const thumbs: { KEY: string; THUMBNAIL: string }[] = [];
      for (const [key, dataUrl] of entries) {
        try {
          const thumb = await resizeToThumbnail(dataUrl, 200);
          if (thumb) thumbs.push({ KEY: key, THUMBNAIL: thumb });
        } catch { /* skip this receipt */ }
      }
      if (thumbs.length > 0) {
        utils.book_append_sheet(wb, utils.json_to_sheet(thumbs), 'Receipts');
      }
    }
  } catch { /* ignore */ }
}

/** Resize a data URL to a JPEG thumbnail at given max size via canvas. Returns '' on failure. */
function resizeToThumbnail(dataUrl: string, maxSize: number): Promise<string> {
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

/**
 * Restore localStorage-backed settings from imported XLSX sheets.
 * Call after the main data import (accounts/categories/transactions) so references resolve.
 *
 * @param sheetGetter — ({ name: string }) => Row[] | undefined. Pass a function that returns
 *   an array of rows for the named sheet, or undefined if it doesn't exist.
 */
export function applyBackupSheetsToLocalStorage(
  sheetGetter: (name: string) => Record<string, unknown>[] | undefined,
): void {
  // SettledDebts
  const settled = sheetGetter('SettledDebts');
  if (settled) {
    const keys = settled.map(r => String(r.KEY ?? '')).filter(Boolean);
    if (keys.length) localStorage.setItem('tracecash_dismissed_debts', JSON.stringify(keys));
  }

  // Templates
  const templates = sheetGetter('Templates');
  if (templates?.[0]?.DATA) {
    try { localStorage.setItem('tracecash_templates_v2', String(templates[0].DATA)); } catch { /* ignore */ }
  }

  // SettledBalancing
  const settledBal = sheetGetter('SettledBalancing');
  if (settledBal) {
    const keys = settledBal.map(r => String(r.KEY ?? '')).filter(Boolean);
    if (keys.length) localStorage.setItem('tracecash_settled_balancing', JSON.stringify(keys));
  }

  // PinLock
  const pin = sheetGetter('PinLock');
  if (pin?.[0]?.PIN) {
    localStorage.setItem('tracecash_pin', String(pin[0].PIN));
    localStorage.setItem('tracecash_pin_enabled', String(pin[0].ENABLED ?? 'true'));
    if (pin[0].BIOMETRIC != null) {
      localStorage.setItem('tracecash_biometric_enabled', String(pin[0].BIOMETRIC));
    }
  }

  // AutoBackup
  const autoBackup = sheetGetter('AutoBackup');
  if (autoBackup?.[0]?.DATA) {
    try { localStorage.setItem('tracecash_auto_backup', String(autoBackup[0].DATA)); } catch { /* ignore */ }
  }

  // Receipts (thumbnails — merged into existing receipts)
  const receipts = sheetGetter('Receipts');
  if (receipts && receipts.length > 0) {
    try {
      const existing = JSON.parse(localStorage.getItem('tracecash_receipts') || '{}') as Record<string, string>;
      for (const r of receipts) {
        const key = String(r.KEY ?? '');
        const thumb = String(r.THUMBNAIL ?? '');
        if (key && thumb) existing[key] = thumb;
      }
      localStorage.setItem('tracecash_receipts', JSON.stringify(existing));
    } catch { /* storage full */ }
  }
}
