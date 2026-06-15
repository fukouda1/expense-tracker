/**
 * Cross-platform "save a generated file" helper.
 * Native (APK): writes to the TraceCash folder + cache, then opens the share sheet.
 * Web: triggers a normal browser download.
 *
 * Mirrors the logic in Settings.tsx saveToDownloads, extracted so other features
 * (e.g. Entrusted Fund monthly report) can reuse it without duplicating native plumbing.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Base64-encode a UTF-8 string (handles non-ASCII safely). */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Save a file from a base64 payload. Returns true on success.
 * @param base64   file content, base64-encoded
 * @param fileName e.g. "japan-trip-2026-06.csv"
 * @param mimeType e.g. "text/csv"
 */
export async function saveBase64File(base64: string, fileName: string, mimeType: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({ path: `TraceCash/${fileName}`, data: base64, directory: Directory.External, recursive: true });
    } catch { /* External may fail on some devices — cache write below still works */ }
    try {
      const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
      try { await Share.share({ title: fileName, url: written.uri, dialogTitle: `Share ${fileName}` }); }
      catch { /* user cancelled share — file is still saved */ }
      return true;
    } catch { return false; }
  }
  // Web: download via blob
  try {
    const byteChars = atob(base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}

/** Convenience: save a CSV string. */
export async function saveCsv(csv: string, fileName: string): Promise<boolean> {
  return saveBase64File(utf8ToBase64(csv), fileName, 'text/csv');
}
