import { getDb } from './database';
import type {
  Transaction, Category, Account, Tag, Budget,
  RecurringTransaction, CategorySummary, MonthlySummary,
  DailySummary, AccountBalance, TransactionFilters,
} from '../types';

type Row = Record<string, unknown>;
function str(row: Row, key: string): string { return String(row[key] ?? '').trim(); }
function num(row: Row, key: string): number { return parseFloat(String(row[key])) || 0; }

// ============================================================
// TRANSACTIONS — Full CRUD + analytics queries
// ============================================================

export async function insertTransaction(
  amount: number, type: string, categoryId: number | null,
  accountId: number, toAccountId: number | null, date: string,
  notes: string, tagIds: number[] = []
): Promise<number> {
  const db = getDb();
  const result = await db.run(
    `INSERT INTO transactions (amount, type, category_id, account_id, to_account_id, date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [amount, type, categoryId, accountId, toAccountId, date, notes]
  );
  const txId = result.changes?.lastId ?? 0;
  for (const tagId of tagIds) {
    await db.run(
      'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
      [txId, tagId]
    );
  }
  return txId;
}

export async function updateTransaction(
  id: number, amount: number, type: string, categoryId: number | null,
  accountId: number, toAccountId: number | null, date: string,
  notes: string, tagIds: number[] = []
): Promise<void> {
  const db = getDb();
  await db.run(
    `UPDATE transactions SET amount=?, type=?, category_id=?, account_id=?,
     to_account_id=?, date=?, notes=? WHERE id=?`,
    [amount, type, categoryId, accountId, toAccountId, date, notes, id]
  );
  await db.run('DELETE FROM transaction_tags WHERE transaction_id=?', [id]);
  for (const tagId of tagIds) {
    await db.run(
      'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
      [id, tagId]
    );
  }
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = getDb();
  await db.run('DELETE FROM transaction_tags WHERE transaction_id=?', [id]);
  await db.run('DELETE FROM transactions WHERE id=?', [id]);
}

export async function getTransactionById(id: number): Promise<Transaction | null> {
  const db = getDb();
  const result = await db.query(
    `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
            a.name as account_name, a2.name as to_account_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts a2 ON t.to_account_id = a2.id
     WHERE t.id = ?`,
    [id]
  );
  const rows = result.values ?? [];
  return rows.length > 0 ? (rows[0] as Transaction) : null;
}

export async function getAllTransactions(limit = 50, offset = 0): Promise<Transaction[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
            a.name as account_name, a2.name as to_account_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts a2 ON t.to_account_id = a2.id
     ORDER BY t.date DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return (result.values ?? []) as Transaction[];
}

export async function getTransactionsByDateRange(from: string, to: string): Promise<Transaction[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
            a.name as account_name, a2.name as to_account_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts a2 ON t.to_account_id = a2.id
     WHERE t.date >= ? AND t.date <= ?
     ORDER BY t.date DESC, t.id DESC`,
    [from, to]
  );
  return (result.values ?? []) as Transaction[];
}

export async function searchTransactions(filters: TransactionFilters): Promise<Transaction[]> {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    conditions.push('t.notes LIKE ?');
    params.push(`%${filters.search}%`);
  }
  if (filters.dateRange) {
    conditions.push('t.date >= ? AND t.date <= ?');
    params.push(filters.dateRange.from, filters.dateRange.to);
  }
  if (filters.categoryId) {
    conditions.push('t.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.accountId) {
    conditions.push('t.account_id = ?');
    params.push(filters.accountId);
  }
  if (filters.type) {
    conditions.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters.amountMin !== undefined) {
    conditions.push('t.amount >= ?');
    params.push(filters.amountMin);
  }
  if (filters.amountMax !== undefined) {
    conditions.push('t.amount <= ?');
    params.push(filters.amountMax);
  }
  if (filters.tagIds && filters.tagIds.length > 0) {
    const placeholders = filters.tagIds.map(() => '?').join(',');
    conditions.push(`t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id IN (${placeholders}))`);
    params.push(...filters.tagIds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
            a.name as account_name, a2.name as to_account_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts a2 ON t.to_account_id = a2.id
     ${where}
     ORDER BY t.date DESC, t.id DESC
     LIMIT 200`,
    params
  );
  return (result.values ?? []) as Transaction[];
}

// ============================================================
// ANALYTICS — SQL aggregation queries
// ============================================================

export async function getTodayTotal(): Promise<{ income: number; expense: number }> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.query(
    `SELECT type, SUM(amount) as total FROM transactions
     WHERE date LIKE ? || '%' AND type IN ('income','expense')
     GROUP BY type`,
    [today]
  );
  const data = { income: 0, expense: 0 };
  for (const row of result.values ?? []) {
    if (row.type === 'income') data.income = row.total;
    if (row.type === 'expense') data.expense = row.total;
  }
  return data;
}

export async function getWeeklyTotal(): Promise<{ income: number; expense: number }> {
  const db = getDb();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  const startStr = start.toISOString().slice(0, 10);

  const result = await db.query(
    `SELECT type, SUM(amount) as total FROM transactions
     WHERE date >= ? AND type IN ('income','expense')
     GROUP BY type`,
    [startStr]
  );
  const data = { income: 0, expense: 0 };
  for (const row of result.values ?? []) {
    if (row.type === 'income') data.income = row.total;
    if (row.type === 'expense') data.expense = row.total;
  }
  return data;
}

export async function getMonthlyTotal(month?: string): Promise<{ income: number; expense: number }> {
  const db = getDb();
  const m = month ?? new Date().toISOString().slice(0, 7);
  const result = await db.query(
    `SELECT type, SUM(amount) as total FROM transactions
     WHERE date LIKE ? || '%' AND type IN ('income','expense')
     GROUP BY type`,
    [m]
  );
  const data = { income: 0, expense: 0 };
  for (const row of result.values ?? []) {
    if (row.type === 'income') data.income = row.total;
    if (row.type === 'expense') data.expense = row.total;
  }
  return data;
}

export async function getCategoryBreakdown(from: string, to: string): Promise<CategorySummary[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT c.id as category_id, c.name as category_name, c.icon as category_icon,
            c.color as category_color, SUM(t.amount) as total, COUNT(*) as count
     FROM transactions t
     JOIN categories c ON t.category_id = c.id
     WHERE t.date >= ? AND t.date <= ? AND t.type = 'expense'
     GROUP BY c.id
     ORDER BY total DESC`,
    [from, to]
  );
  const rows = (result.values ?? []) as CategorySummary[];
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  return rows.map(r => ({ ...r, percentage: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0 }));
}

export async function getMonthlyTrend(months = 12): Promise<MonthlySummary[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT substr(date, 1, 7) as month,
            SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_expense
     FROM transactions
     WHERE type IN ('income','expense')
     GROUP BY substr(date, 1, 7)
     ORDER BY month DESC
     LIMIT ?`,
    [months]
  );
  return ((result.values ?? []) as MonthlySummary[]).map(r => ({
    ...r,
    net: r.total_income - r.total_expense,
  })).reverse();
}

export async function getDailySummaries(month: string): Promise<DailySummary[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT substr(date, 1, 10) as date,
            SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_expense,
            SUM(CASE WHEN type='transfer' THEN amount ELSE 0 END) as total_transfer,
            COUNT(*) as count
     FROM transactions
     WHERE date LIKE ? || '%'
     GROUP BY substr(date, 1, 10)
     ORDER BY date`,
    [month]
  );
  return (result.values ?? []) as DailySummary[];
}

export async function getWeeklyComparison(): Promise<{ thisWeek: number; lastWeek: number }> {
  const db = getDb();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - dayOfWeek);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const thisWeekStr = thisWeekStart.toISOString().slice(0, 10);
  const lastWeekStr = lastWeekStart.toISOString().slice(0, 10);

  const result = await db.query(
    `SELECT
       SUM(CASE WHEN date >= ? THEN amount ELSE 0 END) as this_week,
       SUM(CASE WHEN date >= ? AND date < ? THEN amount ELSE 0 END) as last_week
     FROM transactions WHERE type = 'expense'`,
    [thisWeekStr, lastWeekStr, thisWeekStr]
  );
  const row = result.values?.[0];
  return { thisWeek: row?.this_week ?? 0, lastWeek: row?.last_week ?? 0 };
}

export async function getTopCategories(from: string, to: string, limit = 5): Promise<CategorySummary[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT c.id as category_id, c.name as category_name, c.icon as category_icon,
            c.color as category_color, SUM(t.amount) as total, COUNT(*) as count
     FROM transactions t
     JOIN categories c ON t.category_id = c.id
     WHERE t.date >= ? AND t.date <= ? AND t.type = 'expense'
     GROUP BY c.id
     ORDER BY total DESC
     LIMIT ?`,
    [from, to, limit]
  );
  const rows = (result.values ?? []) as CategorySummary[];
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  return rows.map(r => ({ ...r, percentage: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0 }));
}

// ============================================================
// ACCOUNT BALANCES
// ============================================================

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT a.id as account_id, a.name as account_name, a.color as account_color,
            a.initial_balance +
            COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'income'), 0) -
            COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'expense'), 0) -
            COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'transfer'), 0) +
            COALESCE((SELECT SUM(amount) FROM transactions WHERE to_account_id = a.id AND type = 'transfer'), 0)
            as balance
     FROM accounts a
     ORDER BY a.name`
  );
  return (result.values ?? []) as AccountBalance[];
}

// ============================================================
// CATEGORIES CRUD
// ============================================================

export async function getAllCategories(): Promise<Category[]> {
  const db = getDb();
  const result = await db.query('SELECT * FROM categories ORDER BY sort_order, name');
  return (result.values ?? []) as Category[];
}

export async function reorderCategories(ids: number[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < ids.length; i++) {
    await db.run('UPDATE categories SET sort_order=? WHERE id=?', [i, ids[i]]);
  }
}

export async function toggleCategoryActive(id: number): Promise<void> {
  const db = getDb();
  await db.run('UPDATE categories SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?', [id]);
}

export async function insertCategory(name: string, icon: string, color: string, type: string): Promise<number> {
  const db = getDb();
  const result = await db.run(
    'INSERT INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)',
    [name, icon, color, type]
  );
  return result.changes?.lastId ?? 0;
}

export async function updateCategory(id: number, name: string, icon: string, color: string, type: string): Promise<void> {
  const db = getDb();
  await db.run('UPDATE categories SET name=?, icon=?, color=?, type=? WHERE id=?', [name, icon, color, type, id]);
}

export async function deleteCategory(id: number): Promise<void> {
  const db = getDb();
  await db.run('DELETE FROM categories WHERE id=?', [id]);
}

// ============================================================
// ACCOUNTS CRUD
// ============================================================

export async function getAllAccounts(): Promise<Account[]> {
  const db = getDb();
  const result = await db.query('SELECT * FROM accounts ORDER BY sort_order, name');
  return (result.values ?? []) as Account[];
}

export async function reorderAccounts(ids: number[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < ids.length; i++) {
    await db.run('UPDATE accounts SET sort_order=? WHERE id=?', [i, ids[i]]);
  }
}

export async function toggleAccountActive(id: number): Promise<void> {
  const db = getDb();
  await db.run('UPDATE accounts SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?', [id]);
}

export async function insertAccount(name: string, icon: string, color: string, initialBalance: number): Promise<number> {
  const db = getDb();
  const result = await db.run(
    'INSERT INTO accounts (name, icon, color, initial_balance) VALUES (?, ?, ?, ?)',
    [name, icon, color, initialBalance]
  );
  return result.changes?.lastId ?? 0;
}

export async function updateAccount(id: number, name: string, icon: string, color: string): Promise<void> {
  const db = getDb();
  await db.run('UPDATE accounts SET name=?, icon=?, color=? WHERE id=?', [name, icon, color, id]);
}

export async function deleteAccount(id: number): Promise<void> {
  const db = getDb();
  await db.run('DELETE FROM accounts WHERE id=?', [id]);
}

// ============================================================
// TAGS CRUD
// ============================================================

export async function getAllTags(): Promise<Tag[]> {
  const db = getDb();
  const result = await db.query('SELECT * FROM tags ORDER BY sort_order, name');
  return (result.values ?? []) as Tag[];
}

export async function insertTag(name: string, color: string, categoryId: number | null = null): Promise<number> {
  const db = getDb();
  const result = await db.run('INSERT INTO tags (name, color, category_id) VALUES (?, ?, ?)', [name, color, categoryId]);
  return result.changes?.lastId ?? 0;
}

export async function toggleTagActive(id: number): Promise<void> {
  const db = getDb();
  await db.run('UPDATE tags SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?', [id]);
}

export async function reorderTags(ids: number[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < ids.length; i++) {
    await db.run('UPDATE tags SET sort_order=? WHERE id=?', [i, ids[i]]);
  }
}

export async function deleteTag(id: number): Promise<void> {
  const db = getDb();
  await db.run('DELETE FROM transaction_tags WHERE tag_id=?', [id]);
  await db.run('DELETE FROM tags WHERE id=?', [id]);
}

export async function getTagsForTransaction(transactionId: number): Promise<Tag[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT t.* FROM tags t
     JOIN transaction_tags tt ON t.id = tt.tag_id
     WHERE tt.transaction_id = ?`,
    [transactionId]
  );
  return (result.values ?? []) as Tag[];
}

// ============================================================
// BUDGETS CRUD
// ============================================================

export async function getBudgets(month: string): Promise<Budget[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT b.*, c.name as category_name, c.color as category_color,
            COALESCE((SELECT SUM(t.amount) FROM transactions t
              WHERE t.type='expense'
              AND (b.category_id IS NULL OR t.category_id = b.category_id)
              AND t.date LIKE ? || '%'), 0) as spent
     FROM budgets b
     LEFT JOIN categories c ON b.category_id = c.id
     WHERE b.month = ?
     ORDER BY b.category_id IS NULL DESC, c.name`,
    [month, month]
  );
  return (result.values ?? []) as Budget[];
}

export async function upsertBudget(categoryId: number | null, amount: number, month: string): Promise<void> {
  const db = getDb();
  await db.run(
    `INSERT INTO budgets (category_id, amount, month) VALUES (?, ?, ?)
     ON CONFLICT(category_id, month) DO UPDATE SET amount = ?`,
    [categoryId, amount, month, amount]
  );
}

export async function deleteBudget(id: number): Promise<void> {
  const db = getDb();
  await db.run('DELETE FROM budgets WHERE id=?', [id]);
}

// ============================================================
// RECURRING TRANSACTIONS
// ============================================================

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT r.*, c.name as category_name, a.name as account_name
     FROM recurring_transactions r
     LEFT JOIN categories c ON r.category_id = c.id
     LEFT JOIN accounts a ON r.account_id = a.id
     ORDER BY r.amount DESC`
  );
  return (result.values ?? []) as RecurringTransaction[];
}

export async function insertRecurring(
  amount: number, type: string, categoryId: number | null,
  accountId: number, notes: string, recurrenceType: string, nextDate: string
): Promise<number> {
  const db = getDb();
  const result = await db.run(
    `INSERT INTO recurring_transactions (amount, type, category_id, account_id, notes, recurrence_type, next_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [amount, type, categoryId, accountId, notes, recurrenceType, nextDate]
  );
  return result.changes?.lastId ?? 0;
}

export async function updateRecurring(
  id: number, data: { amount?: number; type?: string; category_id?: number | null; account_id?: number; notes?: string; recurrence_type?: string; next_date?: string; active?: boolean }
): Promise<void> {
  const db = getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.amount !== undefined) { sets.push('amount=?'); vals.push(data.amount); }
  if (data.type !== undefined) { sets.push('type=?'); vals.push(data.type); }
  if (data.category_id !== undefined) { sets.push('category_id=?'); vals.push(data.category_id); }
  if (data.account_id !== undefined) { sets.push('account_id=?'); vals.push(data.account_id); }
  if (data.notes !== undefined) { sets.push('notes=?'); vals.push(data.notes); }
  if (data.recurrence_type !== undefined) { sets.push('recurrence_type=?'); vals.push(data.recurrence_type); }
  if (data.next_date !== undefined) { sets.push('next_date=?'); vals.push(data.next_date); }
  if (data.active !== undefined) { sets.push('active=?'); vals.push(data.active ? 1 : 0); }
  if (sets.length === 0) return;
  vals.push(id);
  await db.run(`UPDATE recurring_transactions SET ${sets.join(', ')} WHERE id=?`, vals);
}

export async function deleteRecurring(id: number): Promise<void> {
  const db = getDb();
  await db.run('DELETE FROM recurring_transactions WHERE id=?', [id]);
}

/** Advance a date by one recurrence period, clamping to last day of month */
function advanceRecurrenceDate(dateStr: string, recurrenceType: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  let nextYear = year, nextMonth = month, nextDay = day;
  if (recurrenceType === 'daily') {
    const d = new Date(year, month - 1, day + 1);
    nextYear = d.getFullYear(); nextMonth = d.getMonth() + 1; nextDay = d.getDate();
  } else if (recurrenceType === 'weekly') {
    const d = new Date(year, month - 1, day + 7);
    nextYear = d.getFullYear(); nextMonth = d.getMonth() + 1; nextDay = d.getDate();
  } else if (recurrenceType === 'monthly') {
    nextMonth = month + 1;
    if (nextMonth > 12) { nextMonth = 1; nextYear = year + 1; }
    const lastDay = new Date(nextYear, nextMonth, 0).getDate(); // day 0 of next month = last day of nextMonth
    nextDay = Math.min(day, lastDay);
  } else if (recurrenceType === 'yearly') {
    nextYear = year + 1;
    const lastDay = new Date(nextYear, month, 0).getDate();
    nextDay = Math.min(day, lastDay);
  }
  return `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(nextDay).padStart(2,'0')}`;
}

export async function processRecurringTransactions(): Promise<number> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.query(
    'SELECT * FROM recurring_transactions WHERE active = 1 AND amount > 0 AND next_date <= ?',
    [today]
  );
  let count = 0;
  for (const r of result.values ?? []) {
    await db.run(
      `INSERT INTO transactions (amount, type, category_id, account_id, date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [r.amount, r.type, r.category_id, r.account_id, r.next_date, r.notes]
    );
    // Advance next_date with last-day-of-month clamping
    const nextDate = advanceRecurrenceDate(r.next_date, r.recurrence_type);
    await db.run(
      'UPDATE recurring_transactions SET next_date = ? WHERE id = ?',
      [nextDate, r.id]
    );
    count++;
  }
  return count;
}

// ============================================================
// CSV EXPORT
// ============================================================

export async function exportToCsv(): Promise<string> {
  const db = getDb();
  const result = await db.query(
    `SELECT t.date, t.type, t.amount, c.name as category, a.name as account,
            a2.name as to_account, t.notes
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts a2 ON t.to_account_id = a2.id
     ORDER BY t.date`
  );
  const rows = result.values ?? [];
  let csv = '"DATE","TYPE","AMOUNT","CATEGORY","ACCOUNT","NOTES"\n';
  for (const r of rows) {
    const acct = r.type === 'transfer' && r.to_account
      ? `${r.account}->${r.to_account}` : r.account;
    const typeLabel = r.type === 'income' ? '(+) Income'
      : r.type === 'expense' ? '(-) Expense' : '(*) Transfer';
    csv += `"${r.date}","${typeLabel}","${r.amount}","${r.category ?? ''}","${acct ?? ''}","${(r.notes ?? '').replace(/"/g, '""')}"\n`;
  }
  return csv;
}

// ============================================================
// FULL IMPORT — import xlsx/csv sheet data into local SQLite
// ============================================================

export interface LocalImportResult {
  accounts: number;
  categories: number;
  tags: number;
  budgets: number;
  recurring: number;
  transactions: number;
  errors: string[];
}

export async function importFromSheets(sheets: Map<string, Row[]>): Promise<LocalImportResult> {
  const db = getDb();
  const result: LocalImportResult = { accounts: 0, categories: 0, tags: 0, budgets: 0, recurring: 0, transactions: 0, errors: [] };

  // ── Accounts ──
  const accountRows = sheets.get('Accounts') ?? [];
  const accountNameToId = new Map<string, number>();
  // Load existing
  const existingAccs = await db.query('SELECT id, name FROM accounts');
  for (const a of existingAccs.values ?? []) accountNameToId.set(a.name, a.id);

  for (const r of accountRows) {
    const name = str(r, 'NAME');
    if (!name) continue;
    try {
      if (accountNameToId.has(name)) { result.accounts++; continue; }
      const res = await db.run(
        'INSERT INTO accounts (name, icon, color, initial_balance) VALUES (?, ?, ?, ?)',
        [name, str(r, 'ICON') || '💰', str(r, 'COLOR') || '#10b981', num(r, 'INITIAL_BALANCE')]
      );
      accountNameToId.set(name, res.changes?.lastId ?? 0);
      result.accounts++;
    } catch (e: any) { result.errors.push(`Account "${name}": ${e.message}`); }
  }
  // Refresh map
  const allAccs = await db.query('SELECT id, name FROM accounts');
  for (const a of allAccs.values ?? []) accountNameToId.set(a.name, a.id);

  // ── Categories ──
  const catRows = sheets.get('Categories') ?? [];
  const catNameToId = new Map<string, number>();
  const existingCats = await db.query('SELECT id, name FROM categories');
  for (const c of existingCats.values ?? []) catNameToId.set(c.name, c.id);

  for (const r of catRows) {
    const name = str(r, 'NAME');
    if (!name) continue;
    try {
      if (catNameToId.has(name)) { result.categories++; continue; }
      const res = await db.run(
        'INSERT INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)',
        [name, str(r, 'ICON') || '📦', str(r, 'COLOR') || '#6b7280', str(r, 'TYPE') || 'expense']
      );
      catNameToId.set(name, res.changes?.lastId ?? 0);
      result.categories++;
    } catch (e: any) { result.errors.push(`Category "${name}": ${e.message}`); }
  }
  const allCats = await db.query('SELECT id, name FROM categories');
  for (const c of allCats.values ?? []) catNameToId.set(c.name, c.id);

  // ── Tags ──
  const tagRows = sheets.get('Tags') ?? [];
  const tagNameToId = new Map<string, number>();
  const existingTags = await db.query('SELECT id, name FROM tags');
  for (const t of existingTags.values ?? []) tagNameToId.set(t.name, t.id);

  for (const r of tagRows) {
    const name = str(r, 'NAME');
    if (!name) continue;
    try {
      if (tagNameToId.has(name)) { result.tags++; continue; }
      const res = await db.run(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        [name, str(r, 'COLOR') || '#3b82f6']
      );
      tagNameToId.set(name, res.changes?.lastId ?? 0);
      result.tags++;
    } catch (e: any) { result.errors.push(`Tag "${name}": ${e.message}`); }
  }

  // ── Budgets ──
  const budgetRows = sheets.get('Budgets') ?? [];
  for (const r of budgetRows) {
    const month = str(r, 'MONTH');
    const amount = num(r, 'AMOUNT');
    if (!month || !amount) continue;
    try {
      const catName = str(r, 'CATEGORY');
      const catId = catName ? (catNameToId.get(catName) ?? null) : null;
      await db.run(
        'INSERT OR REPLACE INTO budgets (category_id, amount, month) VALUES (?, ?, ?)',
        [catId, amount, month]
      );
      result.budgets++;
    } catch (e: any) { result.errors.push(`Budget: ${e.message}`); }
  }

  // ── Recurring ──
  const recRows = sheets.get('Recurring') ?? [];
  for (const r of recRows) {
    const amount = num(r, 'AMOUNT');
    if (!amount) continue;
    try {
      const accId = num(r, 'ACCOUNT_ID') || 1;
      const catId = num(r, 'CATEGORY_ID') || null;
      await db.run(
        'INSERT INTO recurring_transactions (amount, type, category_id, account_id, notes, recurrence_type, next_date, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [amount, str(r, 'TYPE') || 'expense', catId, accId, str(r, 'NOTES'), str(r, 'RECURRENCE') || 'monthly', str(r, 'NEXT_DATE'), 1]
      );
      result.recurring++;
    } catch (e: any) { result.errors.push(`Recurring: ${e.message}`); }
  }

  // ── Transactions ──
  const txRows = sheets.get('Transactions') ?? [];
  for (let i = 0; i < txRows.length; i++) {
    const r = txRows[i];
    const amount = num(r, 'AMOUNT');
    if (!amount) continue;
    try {
      const accName = str(r, 'ACCOUNT');
      const accId = accountNameToId.get(accName);
      if (!accId) { result.errors.push(`Tx row ${i + 1}: unknown account "${accName}"`); continue; }
      const toAccName = str(r, 'TO_ACCOUNT');
      const toAccId = toAccName ? (accountNameToId.get(toAccName) ?? null) : null;
      const catName = str(r, 'CATEGORY');
      const catId = catName ? (catNameToId.get(catName) ?? null) : null;

      const txRes = await db.run(
        'INSERT INTO transactions (amount, type, category_id, account_id, to_account_id, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [amount, str(r, 'TYPE') || 'expense', catId, accId, toAccId, str(r, 'DATE'), str(r, 'NOTES')]
      );

      // Tags
      const tagStr = str(r, 'TAGS');
      if (tagStr && txRes.changes?.lastId) {
        const names = tagStr.split(';').map(s => s.trim()).filter(Boolean);
        for (const tn of names) {
          const tagId = tagNameToId.get(tn);
          if (tagId) {
            await db.run('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)', [txRes.changes.lastId, tagId]);
          }
        }
      }
      result.transactions++;
    } catch (e: any) {
      result.errors.push(`Tx row ${i + 1}: ${e.message}`);
      if (result.errors.length > 50) break;
    }
  }

  return result;
}

// ============================================================
// LEGACY CSV IMPORT — for MyMoney app backup format
// ============================================================

const CATEGORY_MAP: Record<string, { name: string; icon: string; color: string; type: string }> = {
  '3) Food': { name: 'Food', icon: '🍔', color: '#ef4444', type: 'expense' },
  '3) Food - Work': { name: 'Food - Work', icon: '🍱', color: '#f97316', type: 'expense' },
  '2) Transpo': { name: 'Transport', icon: '🚌', color: '#3b82f6', type: 'expense' },
  '2) Transpo - Work': { name: 'Transport - Work', icon: '🚆', color: '#2563eb', type: 'expense' },
  '1) B - Apartment': { name: 'Bills - Rent', icon: '🏠', color: '#8b5cf6', type: 'expense' },
  '1) B - Dental': { name: 'Bills - Dental', icon: '🦷', color: '#ec4899', type: 'expense' },
  '1) B - Food allowance': { name: 'Food Allowance', icon: '🍚', color: '#f59e0b', type: 'expense' },
  '1) Bills - Internet': { name: 'Bills - Internet', icon: '📡', color: '#6366f1', type: 'expense' },
  'Medicine': { name: 'Medicine', icon: '💊', color: '#14b8a6', type: 'expense' },
  'Grocery': { name: 'Grocery', icon: '🛒', color: '#22c55e', type: 'expense' },
  'Electronics': { name: 'Electronics', icon: '📱', color: '#0ea5e9', type: 'expense' },
  'Social': { name: 'Social', icon: '🎉', color: '#f43f5e', type: 'expense' },
  'Z - Fitness': { name: 'Fitness', icon: '💪', color: '#10b981', type: 'expense' },
  'Pet Expenses': { name: 'Pet Expenses', icon: '🐾', color: '#d97706', type: 'expense' },
  'Clothing/Grooming': { name: 'Clothing', icon: '👕', color: '#7c3aed', type: 'expense' },
  'Lent money': { name: 'Lent Money', icon: '💸', color: '#ef4444', type: 'expense' },
  'Others': { name: 'Others', icon: '📦', color: '#6b7280', type: 'expense' },
  'C - Hon': { name: 'C - Hon', icon: '❤️', color: '#ec4899', type: 'expense' },
  'Salary': { name: 'Salary', icon: '💵', color: '#10b981', type: 'income' },
  'Bonus': { name: 'Bonus', icon: '🎁', color: '#22c55e', type: 'income' },
  'Bank Interest': { name: 'Bank Interest', icon: '🏦', color: '#0ea5e9', type: 'income' },
  'Lent Payment': { name: 'Lent Payment', icon: '💰', color: '#22c55e', type: 'income' },
};

function parseLegacyCsvDate(dateStr: string): string {
  const months: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  };
  const match = dateStr.trim().match(/(\w+)\s+(\d+),\s+(\d+)\s+(\d+):(\d+)\s+(\w+)/);
  if (!match) return new Date().toISOString().slice(0, 16);
  const [, mon, day, year, hr, min, ampm] = match;
  let hour = parseInt(hr);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return `${year}-${months[mon]}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}`;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { fields.push(current); current = ''; }
    else current += ch;
  }
  fields.push(current);
  return fields;
}

export async function importLegacyCsv(csvContent: string): Promise<LocalImportResult> {
  const db = getDb();
  const result: LocalImportResult = { accounts: 0, categories: 0, tags: 0, budgets: 0, recurring: 0, transactions: 0, errors: [] };

  // Join multiline notes
  const rawLines = csvContent.split('\n');
  const lines: string[] = [];
  for (const line of rawLines) {
    const t = line.trimEnd();
    if (!t) continue;
    if (t.startsWith('"') || lines.length === 0) lines.push(t);
    else lines[lines.length - 1] += '\n' + t;
  }
  if (!lines[0]?.includes('TIME')) return result;

  const catCache = new Map<string, number>();
  const accCache = new Map<string, number>();
  // Load existing
  const eCats = await db.query('SELECT id, name FROM categories');
  for (const c of eCats.values ?? []) catCache.set(c.name, c.id);
  const eAccs = await db.query('SELECT id, name FROM accounts');
  for (const a of eAccs.values ?? []) accCache.set(a.name, a.id);

  async function getOrCreateCat(orig: string): Promise<number | null> {
    const m = CATEGORY_MAP[orig];
    const name = m?.name ?? orig;
    if (catCache.has(name)) return catCache.get(name)!;
    try {
      const res = await db.run('INSERT INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)',
        [name, m?.icon ?? '📦', m?.color ?? '#6b7280', m?.type ?? 'expense']);
      catCache.set(name, res.changes?.lastId ?? 0);
      return res.changes?.lastId ?? 0;
    } catch { const e = await db.query('SELECT id FROM categories WHERE name=?', [name]); return e.values?.[0]?.id ?? null; }
  }

  async function getOrCreateAcc(name: string): Promise<number> {
    if (accCache.has(name)) return accCache.get(name)!;
    try {
      const res = await db.run('INSERT INTO accounts (name, icon, color, initial_balance) VALUES (?, ?, ?, ?)',
        [name, '💰', '#10b981', 0]);
      accCache.set(name, res.changes?.lastId ?? 0);
      return res.changes?.lastId ?? 0;
    } catch { const e = await db.query('SELECT id FROM accounts WHERE name=?', [name]); return e.values?.[0]?.id ?? 1; }
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const f = parseCsvLine(lines[i]);
      if (f.length < 5) continue;
      const [timeStr, typeStr, amountStr, catStr, accStr, ...notesParts] = f;
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) continue;
      const type = typeStr.includes('Income') ? 'income' : typeStr.includes('Transfer') ? 'transfer' : 'expense';
      const date = parseLegacyCsvDate(timeStr);
      let accId: number, toAccId: number | null = null, catId: number | null = null;
      if (type === 'transfer') {
        const parts = accStr.split('->');
        accId = await getOrCreateAcc(parts[0].trim());
        if (parts[1]) toAccId = await getOrCreateAcc(parts[1].trim());
      } else {
        accId = await getOrCreateAcc(accStr.trim());
        const cn = catStr.trim();
        if (cn && cn !== '-' && cn !== '  -  ') catId = await getOrCreateCat(cn);
      }
      await db.run('INSERT INTO transactions (amount, type, category_id, account_id, to_account_id, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [amount, type, catId, accId, toAccId, date, notesParts.join(',').trim()]);
      result.transactions++;
    } catch (e: any) {
      result.errors.push(`Row ${i + 1}: ${e.message}`);
      if (result.errors.length > 20) break;
    }
  }

  return result;
}
