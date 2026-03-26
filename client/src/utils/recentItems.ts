const RECENT_ACCOUNTS_KEY = 'tracecash_recent_accounts';
const RECENT_CATS_KEY = 'tracecash_recent_categories';
const MAX_RECENT = 3;

export function getRecentAccountIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ACCOUNTS_KEY) || '[]');
  } catch { return []; }
}

export function addRecentAccountId(id: number): void {
  const recent = getRecentAccountIds().filter(i => i !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function getRecentCategoryIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_CATS_KEY) || '[]');
  } catch { return []; }
}

export function addRecentCategoryId(id: number): void {
  const recent = getRecentCategoryIds().filter(i => i !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_CATS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}
