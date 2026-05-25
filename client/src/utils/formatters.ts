// Zero-config currencies — reads from localStorage so it works everywhere
// (inside and outside React components, in chart tooltips, etc.)

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR']);

const LOCALE_MAP: Record<string, string> = {
  PHP: 'en-PH', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP',
  KRW: 'ko-KR', CNY: 'zh-CN', INR: 'en-IN', AUD: 'en-AU', CAD: 'en-CA',
  SGD: 'en-SG', MYR: 'ms-MY', THB: 'th-TH', IDR: 'id-ID', VND: 'vi-VN',
  BRL: 'pt-BR', MXN: 'es-MX', TWD: 'zh-TW', HKD: 'zh-HK', CHF: 'de-CH',
  SEK: 'sv-SE', NZD: 'en-NZ', AED: 'ar-AE', SAR: 'ar-SA', NGN: 'en-NG', ZAR: 'en-ZA',
};

function getStoredCurrency(): { code: string; locale: string } {
  const code = (typeof localStorage !== 'undefined' && localStorage.getItem('tracecash_currency')) || 'PHP';
  return { code, locale: LOCALE_MAP[code] || 'en-US' };
}

export function formatCurrency(amount: number): string {
  const { code, locale } = getStoredCurrency();
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : 2,
    maximumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : 2,
  }).format(amount);
}

export function formatNumber(amount: number): string {
  const { locale } = getStoredCurrency();
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a raw numeric input string for display with thousand separators.
 * Keeps a trailing "." and in-progress decimals intact (the field is being typed),
 * so it must NOT force 2 decimals. Comma-grouped (en-US style). '' stays ''.
 * Example: "30000" -> "30,000", "30000.5" -> "30,000.5", "1234567." -> "1,234,567."
 */
export function formatAmountInput(raw: string): string {
  if (raw === '' || raw == null) return '';
  const hasDot = raw.includes('.');
  const [intPart, decPart = ''] = raw.split('.');
  const grouped = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return hasDot ? `${grouped}.${decPart}` : grouped;
}

export function getCurrencySymbol(): string {
  const { code, locale } = getStoredCurrency();
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: code }).formatToParts(0);
  return parts.find(p => p.type === 'currency')?.value ?? code;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

export function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getMonthStart(month?: string): string {
  const m = month ?? getCurrentMonth();
  return `${m}-01`;
}

export function getMonthEnd(month?: string): string {
  const m = month ?? getCurrentMonth();
  const [y, mo] = m.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return `${m}-${String(lastDay).padStart(2, '0')}`;
}

export function getDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function getFirstDayOfMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).getDay();
}

export function percentOf(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/** Check if item is active — handles both boolean (web) and integer 0/1 (SQLite) */
export function isActive(item: { active?: boolean | number }): boolean { return item.active !== false && item.active !== 0; }
