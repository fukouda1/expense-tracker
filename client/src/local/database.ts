import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'tracecash_local';
const DB_VERSION = 1;

let sqliteConnection: SQLiteConnection | null = null;
let db: SQLiteDBConnection | null = null;

// ============================================================
// SQLiteOpenHelper — raw SQLite, no ORM
// ============================================================

const CREATE_TABLES_SQL = [
  // Accounts
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT '💰',
    color TEXT NOT NULL DEFAULT '#10b981',
    initial_balance REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  )`,

  // Categories
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT '📦',
    color TEXT NOT NULL DEFAULT '#6b7280',
    type TEXT NOT NULL DEFAULT 'expense' CHECK(type IN ('income','expense','both')),
    active INTEGER NOT NULL DEFAULT 1
  )`,

  // Tags
  `CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    active INTEGER NOT NULL DEFAULT 1,
    category_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`,

  // Transactions (the main expenses/income/transfer table)
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
    category_id INTEGER,
    account_id INTEGER NOT NULL,
    to_account_id INTEGER,
    date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id)
  )`,

  // Transaction-Tags many-to-many
  `CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (transaction_id, tag_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )`,

  // Budgets
  `CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    amount REAL NOT NULL,
    month TEXT NOT NULL,
    UNIQUE(category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`,

  // Recurring transactions
  `CREATE TABLE IF NOT EXISTS recurring_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
    category_id INTEGER,
    account_id INTEGER NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('daily','weekly','monthly','yearly')),
    next_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )`,

  // Indexes for performance
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month)`,
];

// Migrations for adding columns to existing tables (safe to run multiple times)
const MIGRATIONS_SQL = [
  `ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE budgets ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
];

// Initialize sort_order for existing rows that all have 0
const INIT_SORT_ORDER_SQL = [
  `UPDATE categories SET sort_order = id WHERE sort_order = 0 AND id > 0`,
  `UPDATE accounts SET sort_order = id WHERE sort_order = 0 AND id > 0`,
  `UPDATE tags SET sort_order = id WHERE sort_order = 0 AND id > 0`,
];

const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: '🍔', color: '#ef4444', type: 'expense' },
  { name: 'Food - Work', icon: '🍱', color: '#f97316', type: 'expense' },
  { name: 'Transport', icon: '🚌', color: '#3b82f6', type: 'expense' },
  { name: 'Transport - Work', icon: '🚆', color: '#2563eb', type: 'expense' },
  { name: 'Bills - Rent', icon: '🏠', color: '#8b5cf6', type: 'expense' },
  { name: 'Bills - Internet', icon: '📡', color: '#6366f1', type: 'expense' },
  { name: 'Bills - Dental', icon: '🦷', color: '#ec4899', type: 'expense' },
  { name: 'Food Allowance', icon: '🍚', color: '#f59e0b', type: 'expense' },
  { name: 'Medicine', icon: '💊', color: '#14b8a6', type: 'expense' },
  { name: 'Grocery', icon: '🛒', color: '#22c55e', type: 'expense' },
  { name: 'Shopping', icon: '🛍️', color: '#a855f7', type: 'expense' },
  { name: 'Electronics', icon: '📱', color: '#0ea5e9', type: 'expense' },
  { name: 'Social', icon: '🎉', color: '#f43f5e', type: 'expense' },
  { name: 'Fitness', icon: '💪', color: '#10b981', type: 'expense' },
  { name: 'Pet Expenses', icon: '🐾', color: '#d97706', type: 'expense' },
  { name: 'Clothing', icon: '👕', color: '#7c3aed', type: 'expense' },
  { name: 'Others', icon: '📦', color: '#6b7280', type: 'expense' },
  { name: 'Salary', icon: '💵', color: '#10b981', type: 'income' },
  { name: 'Bonus', icon: '🎁', color: '#22c55e', type: 'income' },
  { name: 'Bank Interest', icon: '🏦', color: '#0ea5e9', type: 'income' },
  { name: 'Cash Back', icon: '💸', color: '#14b8a6', type: 'income' },
];

const DEFAULT_ACCOUNTS = [
  { name: 'Cash', icon: '💵', color: '#22c55e', initial_balance: 0 },
  { name: 'Bank - BOC', icon: '🏦', color: '#3b82f6', initial_balance: 0 },
  { name: 'Bank - Metrobank', icon: '🏦', color: '#8b5cf6', initial_balance: 0 },
  { name: 'Gcash', icon: '📱', color: '#0ea5e9', initial_balance: 0 },
  { name: 'Seabank', icon: '🌊', color: '#14b8a6', initial_balance: 0 },
];

export async function initDatabase(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Not native platform — skipping Capacitor SQLite init');
    return;
  }

  sqliteConnection = new SQLiteConnection(CapacitorSQLite);

  const consistency = await sqliteConnection.checkConnectionsConsistency();
  const isConnected = (await sqliteConnection.isConnection(DB_NAME, false)).result;

  if (consistency.result && isConnected) {
    db = await sqliteConnection.retrieveConnection(DB_NAME, false);
  } else {
    db = await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
  }

  await db.open();

  // Create all tables
  for (const sql of CREATE_TABLES_SQL) {
    await db.execute(sql);
  }

  // Run migrations (add missing columns to existing tables)
  for (const sql of MIGRATIONS_SQL) {
    try { await db.execute(sql); } catch { /* column already exists — ignore */ }
  }

  // Initialize sort_order for existing rows (one-time fix for rows with sort_order=0)
  for (const sql of INIT_SORT_ORDER_SQL) {
    try { await db.execute(sql); } catch { /* ignore */ }
  }

  // Seed default data if empty
  const catCount = await db.query('SELECT COUNT(*) as count FROM categories');
  if (catCount.values && catCount.values[0]?.count === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await db.run(
        'INSERT INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)',
        [cat.name, cat.icon, cat.color, cat.type]
      );
    }
  }

  const accCount = await db.query('SELECT COUNT(*) as count FROM accounts');
  if (accCount.values && accCount.values[0]?.count === 0) {
    for (const acc of DEFAULT_ACCOUNTS) {
      await db.run(
        'INSERT INTO accounts (name, icon, color, initial_balance) VALUES (?, ?, ?, ?)',
        [acc.name, acc.icon, acc.color, acc.initial_balance]
      );
    }
  }
}

export function getDb(): SQLiteDBConnection {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS };
