import { getDb } from './database';
import type {
  Transaction, Category, Account, Tag, Budget,
  RecurringTransaction, CategorySummary, MonthlySummary,
  DailySummary, AccountBalance, TransactionFilters,
} from '../types';

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
  const result = await db.query('SELECT * FROM categories ORDER BY name');
  return (result.values ?? []) as Category[];
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
  const result = await db.query('SELECT * FROM accounts ORDER BY name');
  return (result.values ?? []) as Account[];
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
  const result = await db.query('SELECT * FROM tags ORDER BY name');
  return (result.values ?? []) as Tag[];
}

export async function insertTag(name: string, color: string): Promise<number> {
  const db = getDb();
  const result = await db.run('INSERT INTO tags (name, color) VALUES (?, ?)', [name, color]);
  return result.changes?.lastId ?? 0;
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
     WHERE r.active = 1
     ORDER BY r.next_date`
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

export async function deleteRecurring(id: number): Promise<void> {
  const db = getDb();
  await db.run('DELETE FROM recurring_transactions WHERE id=?', [id]);
}

export async function processRecurringTransactions(): Promise<number> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.query(
    'SELECT * FROM recurring_transactions WHERE active = 1 AND next_date <= ?',
    [today]
  );
  let count = 0;
  for (const r of result.values ?? []) {
    await db.run(
      `INSERT INTO transactions (amount, type, category_id, account_id, date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [r.amount, r.type, r.category_id, r.account_id, r.next_date, r.notes]
    );
    // Advance next_date
    const next = new Date(r.next_date);
    switch (r.recurrence_type) {
      case 'daily': next.setDate(next.getDate() + 1); break;
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    }
    await db.run(
      'UPDATE recurring_transactions SET next_date = ? WHERE id = ?',
      [next.toISOString().slice(0, 10), r.id]
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
