/**
 * DataContext — THE platform routing layer.
 *
 * This is the ONE place in the app that branches between native (APK, local SQLite)
 * and web (Express + Prisma). Every other component imports from here and stays
 * platform-agnostic. Never import `repo` or `api` directly from components — go through this.
 *
 * When adding a new function:
 *  1. Add to the DataContextType interface below.
 *  2. Write the `if (isNative) await repo.X(...); else await api.<method>('/api/...', ...)` body.
 *  3. Export it in the provider value at the bottom.
 *
 * Also triggers processRecurringTransactions on refresh (native only — web has no equivalent yet).
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import type {
  Transaction, Category, Account, Tag, Budget,
  RecurringTransaction, CategorySummary, MonthlySummary,
  DailySummary, AccountBalance, TransactionFilters,
} from '../types';
import * as repo from '../local/repository';
import * as api from '../services/api';
import { getCurrentMonth } from '../utils/formatters';

const isNative = Capacitor.isNativePlatform();

interface DataContextType {
  // State
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  loading: boolean;
  // Transaction CRUD
  addTransaction: (t: Omit<Transaction, 'id' | 'created_at'>, tagIds?: number[]) => Promise<void>;
  editTransaction: (t: Transaction, tagIds?: number[]) => Promise<void>;
  removeTransaction: (id: number) => Promise<void>;
  // Data loading
  loadTransactions: (limit?: number, offset?: number) => Promise<void>;
  searchTransactions: (filters: TransactionFilters, offset?: number) => Promise<{ results: Transaction[]; total: number; hasMore: boolean }>;
  getTransactionsByDate: (from: string, to: string) => Promise<Transaction[]>;
  // Analytics
  getTodayTotal: () => Promise<{ income: number; expense: number }>;
  getWeeklyTotal: () => Promise<{ income: number; expense: number }>;
  getMonthlyTotal: (month?: string) => Promise<{ income: number; expense: number }>;
  getCategoryBreakdown: (from: string, to: string) => Promise<CategorySummary[]>;
  getMonthlyTrend: (months?: number) => Promise<MonthlySummary[]>;
  getDailySummaries: (month: string) => Promise<DailySummary[]>;
  getWeeklyComparison: () => Promise<{ thisWeek: number; lastWeek: number }>;
  getTopCategories: (from: string, to: string, limit?: number) => Promise<CategorySummary[]>;
  getAccountBalances: () => Promise<AccountBalance[]>;
  // Category/Account/Tag CRUD
  addCategory: (name: string, icon: string, color: string, type: string) => Promise<void>;
  editCategory: (id: number, name: string, icon: string, color: string, type: string) => Promise<void>;
  removeCategory: (id: number) => Promise<void>;
  addAccount: (name: string, icon: string, color: string, initialBalance: number) => Promise<void>;
  editAccount: (id: number, name: string, icon: string, color: string) => Promise<void>;
  removeAccount: (id: number) => Promise<void>;
  addTag: (name: string, color: string, categoryId?: number | null) => Promise<void>;
  removeTag: (id: number) => Promise<void>;
  // Toggle active
  toggleAccountActive: (id: number) => Promise<void>;
  toggleCategoryActive: (id: number) => Promise<void>;
  toggleTagActive: (id: number) => Promise<void>;
  // Budgets
  loadBudgets: (month?: string) => Promise<void>;
  saveBudget: (categoryId: number | null, amount: number, month: string) => Promise<void>;
  editBudget: (id: number, categoryId: number | null, amount: number, month: string) => Promise<void>;
  removeBudget: (id: number) => Promise<void>;
  toggleBudgetActive: (id: number) => Promise<void>;
  // Recurring
  loadRecurring: () => Promise<void>;
  addRecurring: (r: Omit<RecurringTransaction, 'id' | 'active' | 'category_name' | 'account_name'>) => Promise<void>;
  editRecurring: (id: number, data: Partial<Omit<RecurringTransaction, 'id' | 'category_name' | 'account_name'>>) => Promise<void>;
  removeRecurring: (id: number) => Promise<void>;
  // Reorder
  reorderAccounts: (ids: number[]) => Promise<void>;
  reorderCategories: (ids: number[]) => Promise<void>;
  reorderTags: (ids: number[]) => Promise<void>;
  // Copy day
  copyDayTransactions: (sourceDate: string, targetDate: string) => Promise<number>;
  // Export
  exportCsv: () => Promise<string>;
  // Refresh
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextType>(null!);

export function DataProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    if (isNative) {
      setCategories(await repo.getAllCategories());
    } else {
      const res = await api.get<Category[]>('/api/categories');
      setCategories(res);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    if (isNative) {
      setAccounts(await repo.getAllAccounts());
    } else {
      const res = await api.get<Account[]>('/api/accounts');
      setAccounts(res);
    }
  }, []);

  const loadTags = useCallback(async () => {
    if (isNative) {
      setTags(await repo.getAllTags());
    } else {
      const res = await api.get<Tag[]>('/api/tags');
      setTags(res);
    }
  }, []);

  const loadTransactions = useCallback(async (limit = 50, offset = 0) => {
    if (isNative) {
      setTransactions(await repo.getAllTransactions(limit, offset));
    } else {
      const res = await api.get<Transaction[]>(`/api/transactions?limit=${limit}&offset=${offset}`);
      setTransactions(res);
    }
  }, []);

  const loadBudgets = useCallback(async (month?: string) => {
    const m = month ?? getCurrentMonth();
    let budgetList: Budget[];
    if (isNative) {
      budgetList = await repo.getBudgets(m);
    } else {
      budgetList = await api.get<Budget[]>(`/api/budgets?month=${m}`);
    }
    // Auto-copy from previous month if current month has no budgets
    if (budgetList.length === 0) {
      const [y, mo] = m.split('-').map(Number);
      const prevDate = new Date(y, mo - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      let prevBudgets: Budget[];
      if (isNative) {
        prevBudgets = await repo.getBudgets(prevMonth);
      } else {
        prevBudgets = await api.get<Budget[]>(`/api/budgets?month=${prevMonth}`);
      }
      if (prevBudgets.length > 0) {
        for (const b of prevBudgets.filter(pb => pb.active !== false)) {
          if (isNative) {
            await repo.upsertBudget(b.category_id, b.amount, m);
          } else {
            await api.post('/api/budgets', { categoryId: b.category_id, amount: b.amount, month: m });
          }
        }
        // Reload the newly created budgets
        if (isNative) {
          budgetList = await repo.getBudgets(m);
        } else {
          budgetList = await api.get<Budget[]>(`/api/budgets?month=${m}`);
        }
      }
    }
    setBudgets(budgetList);
  }, []);

  const loadRecurring = useCallback(async () => {
    if (isNative) {
      setRecurring(await repo.getRecurringTransactions());
    } else {
      const res = await api.get<RecurringTransaction[]>('/api/recurring');
      setRecurring(res);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (isNative) {
        await repo.processRecurringTransactions();
      }
      await Promise.all([loadCategories(), loadAccounts(), loadTags(), loadTransactions(), loadBudgets()]);
    } finally {
      setLoading(false);
    }
  }, [loadCategories, loadAccounts, loadTags, loadTransactions, loadBudgets]);

  useEffect(() => { refresh(); }, [refresh]);

  // Transaction CRUD
  const addTransaction = async (t: Omit<Transaction, 'id' | 'created_at'>, tagIds: number[] = []) => {
    if (isNative) {
      await repo.insertTransaction(t.amount, t.type, t.category_id, t.account_id, t.to_account_id, t.date, t.notes, tagIds);
    } else {
      await api.post('/api/transactions', { ...t, tagIds });
    }
    await loadTransactions();
  };

  const editTransaction = async (t: Transaction, tagIds: number[] = []) => {
    if (isNative) {
      await repo.updateTransaction(t.id, t.amount, t.type, t.category_id, t.account_id, t.to_account_id, t.date, t.notes, tagIds);
    } else {
      await api.put(`/api/transactions/${t.id}`, { ...t, tagIds });
    }
    await loadTransactions();
  };

  const removeTransaction = async (id: number) => {
    if (isNative) {
      await repo.deleteTransaction(id);
    } else {
      await api.del(`/api/transactions/${id}`);
    }
    await loadTransactions();
  };

  const searchTx = async (filters: TransactionFilters, offset = 0): Promise<{ results: Transaction[]; total: number; hasMore: boolean }> => {
    if (isNative) {
      const results = await repo.searchTransactions(filters);
      return { results, total: results.length, hasMore: false };
    }
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.dateRange) { params.set('from', filters.dateRange.from); params.set('to', filters.dateRange.to); }
    if (filters.categoryId) params.set('categoryId', String(filters.categoryId));
    if (filters.accountId) params.set('accountId', String(filters.accountId));
    if (filters.type) params.set('type', filters.type);
    if (filters.amountMin !== undefined) params.set('amountMin', String(filters.amountMin));
    if (filters.amountMax !== undefined) params.set('amountMax', String(filters.amountMax));
    params.set('limit', '50');
    params.set('offset', String(offset));
    return api.get<{ results: Transaction[]; total: number; hasMore: boolean }>(`/api/transactions/search?${params}`);
  };

  const getTransactionsByDate = async (from: string, to: string): Promise<Transaction[]> => {
    if (isNative) return repo.getTransactionsByDateRange(from, to);
    return api.get<Transaction[]>(`/api/transactions?from=${from}&to=${to}`);
  };

  // Analytics
  const getTodayTotal = async (): Promise<{ income: number; expense: number }> => {
    if (isNative) return repo.getTodayTotal();
    return api.get<{ income: number; expense: number }>('/api/analytics/today');
  };
  const getWeeklyTotal = async (): Promise<{ income: number; expense: number }> => {
    if (isNative) return repo.getWeeklyTotal();
    return api.get<{ income: number; expense: number }>('/api/analytics/weekly');
  };
  const getMonthlyTotal = async (month?: string): Promise<{ income: number; expense: number }> => {
    if (isNative) return repo.getMonthlyTotal(month);
    return api.get<{ income: number; expense: number }>(`/api/analytics/monthly${month ? `?month=${month}` : ''}`);
  };
  const getCategoryBreakdown = async (from: string, to: string): Promise<CategorySummary[]> => {
    if (isNative) return repo.getCategoryBreakdown(from, to);
    return api.get<CategorySummary[]>(`/api/analytics/categories?from=${from}&to=${to}`);
  };
  const getMonthlyTrend = async (months = 12): Promise<MonthlySummary[]> => {
    if (isNative) return repo.getMonthlyTrend(months);
    return api.get<MonthlySummary[]>(`/api/analytics/trend?months=${months}`);
  };
  const getDailySummaries = async (month: string): Promise<DailySummary[]> => {
    if (isNative) return repo.getDailySummaries(month);
    return api.get<DailySummary[]>(`/api/analytics/daily?month=${month}`);
  };
  const getWeeklyComparison = async (): Promise<{ thisWeek: number; lastWeek: number }> => {
    if (isNative) return repo.getWeeklyComparison();
    return api.get<{ thisWeek: number; lastWeek: number }>('/api/analytics/weekly-comparison');
  };
  const getTopCategories = async (from: string, to: string, limit = 5): Promise<CategorySummary[]> => {
    if (isNative) return repo.getTopCategories(from, to, limit);
    return api.get<CategorySummary[]>(`/api/analytics/top-categories?from=${from}&to=${to}&limit=${limit}`);
  };
  const getAccountBalances = async (): Promise<AccountBalance[]> => {
    if (isNative) return repo.getAccountBalances();
    return api.get<AccountBalance[]>('/api/analytics/balances');
  };

  // Category CRUD
  const addCategory = async (name: string, icon: string, color: string, type: string) => {
    if (isNative) await repo.insertCategory(name, icon, color, type);
    else await api.post('/api/categories', { name, icon, color, type });
    await loadCategories();
  };
  const editCategory = async (id: number, name: string, icon: string, color: string, type: string) => {
    if (isNative) await repo.updateCategory(id, name, icon, color, type);
    else await api.put(`/api/categories/${id}`, { name, icon, color, type });
    await loadCategories();
  };
  const removeCategory = async (id: number) => {
    if (isNative) await repo.deleteCategory(id);
    else await api.del(`/api/categories/${id}`);
    await loadCategories();
  };

  // Account CRUD
  const addAccount = async (name: string, icon: string, color: string, initialBalance: number) => {
    if (isNative) await repo.insertAccount(name, icon, color, initialBalance);
    else await api.post('/api/accounts', { name, icon, color, initialBalance });
    await loadAccounts();
  };
  const editAccount = async (id: number, name: string, icon: string, color: string) => {
    if (isNative) await repo.updateAccount(id, name, icon, color);
    else await api.put(`/api/accounts/${id}`, { name, icon, color });
    await loadAccounts();
  };
  const removeAccount = async (id: number) => {
    if (isNative) await repo.deleteAccount(id);
    else await api.del(`/api/accounts/${id}`);
    await loadAccounts();
  };

  // Tag CRUD
  const addTag = async (name: string, color: string, categoryId?: number | null) => {
    if (isNative) await repo.insertTag(name, color, categoryId ?? null);
    else await api.post('/api/tags', { name, color, category_id: categoryId ?? null });
    await loadTags();
  };
  const removeTag = async (id: number) => {
    if (isNative) await repo.deleteTag(id);
    else await api.del(`/api/tags/${id}`);
    await loadTags();
  };

  // Toggle active
  const toggleAccountActive = async (id: number) => {
    if (isNative) {
      await repo.toggleAccountActive(id);
    } else {
      await api.patch(`/api/accounts/${id}/toggle`);
    }
    await loadAccounts();
  };
  const toggleCategoryActive = async (id: number) => {
    if (isNative) {
      await repo.toggleCategoryActive(id);
    } else {
      await api.patch(`/api/categories/${id}/toggle`);
    }
    await loadCategories();
  };
  const toggleTagActive = async (id: number) => {
    if (isNative) {
      await repo.toggleTagActive(id);
    } else {
      await api.patch(`/api/tags/${id}/toggle`);
    }
    await loadTags();
  };

  // Budget CRUD
  const saveBudget = async (categoryId: number | null, amount: number, month: string) => {
    if (isNative) await repo.upsertBudget(categoryId, amount, month);
    else await api.post('/api/budgets', { categoryId, amount, month });
    await loadBudgets(month);
  };
  const editBudget = async (id: number, categoryId: number | null, amount: number, month: string) => {
    if (isNative) {
      // For native: delete old and create new
      await repo.deleteBudget(id);
      await repo.upsertBudget(categoryId, amount, month);
    } else {
      await api.put(`/api/budgets/${id}`, { categoryId, amount, month });
    }
    await loadBudgets(month);
  };
  const removeBudget = async (id: number) => {
    if (isNative) await repo.deleteBudget(id);
    else await api.del(`/api/budgets/${id}`);
    await loadBudgets();
  };
  const toggleBudgetActive = async (id: number) => {
    if (isNative) {
      await repo.toggleBudgetActive(id);
    } else {
      await api.patch(`/api/budgets/${id}/toggle`);
    }
    await loadBudgets();
  };

  // Recurring CRUD
  const addRecurring = async (r: Omit<RecurringTransaction, 'id' | 'active' | 'category_name' | 'account_name'>) => {
    if (isNative) await repo.insertRecurring(r.amount, r.type, r.category_id, r.account_id, r.notes, r.recurrence_type, r.next_date, r.auto_create ?? true);
    else await api.post('/api/recurring', r);
    await loadRecurring();
  };
  const editRecurring = async (id: number, data: Partial<Omit<RecurringTransaction, 'id' | 'category_name' | 'account_name'>>) => {
    if (isNative) {
      await repo.updateRecurring(id, data);
    } else {
      await api.put(`/api/recurring/${id}`, data);
    }
    await loadRecurring();
  };
  const removeRecurring = async (id: number) => {
    if (isNative) await repo.deleteRecurring(id);
    else await api.del(`/api/recurring/${id}`);
    await loadRecurring();
  };

  // Reorder
  const reorderAccounts = async (ids: number[]) => {
    if (isNative) await repo.reorderAccounts(ids);
    else await api.post('/api/accounts/reorder', { ids });
    await loadAccounts();
  };
  const reorderCategories = async (ids: number[]) => {
    if (isNative) await repo.reorderCategories(ids);
    else await api.post('/api/categories/reorder', { ids });
    await loadCategories();
  };
  const reorderTags = async (ids: number[]) => {
    if (isNative) await repo.reorderTags(ids);
    else await api.post('/api/tags/reorder', { ids });
    await loadTags();
  };

  // Copy day
  const copyDayTransactions = async (sourceDate: string, targetDate: string): Promise<number> => {
    if (isNative) {
      // For native: fetch source day transactions and insert each one with new date
      const txs = await repo.getTransactionsByDateRange(sourceDate, sourceDate + 'T23:59:59');
      for (const tx of txs) {
        const timePart = tx.date.includes('T') ? tx.date.slice(10) : 'T12:00';
        await repo.insertTransaction(tx.amount, tx.type, tx.category_id, tx.account_id, tx.to_account_id, targetDate + timePart, tx.notes);
      }
      await loadTransactions();
      return txs.length;
    }
    const res = await api.post<{ created: number }>('/api/transactions/copy-day', { sourceDate, targetDate });
    await loadTransactions();
    return res.created;
  };

  // Export
  const exportCsv = async (): Promise<string> => {
    if (isNative) return repo.exportToCsv();
    const res = await api.get<{ csv: string }>('/api/export/csv');
    return res.csv;
  };

  return (
    <DataContext.Provider value={{
      transactions, categories, accounts, tags, budgets, recurring, loading,
      addTransaction, editTransaction, removeTransaction,
      loadTransactions, searchTransactions: searchTx, getTransactionsByDate,
      getTodayTotal, getWeeklyTotal, getMonthlyTotal,
      getCategoryBreakdown, getMonthlyTrend, getDailySummaries,
      getWeeklyComparison, getTopCategories, getAccountBalances,
      addCategory, editCategory, removeCategory,
      addAccount, editAccount, removeAccount,
      addTag, removeTag,
      toggleAccountActive, toggleCategoryActive, toggleTagActive,
      loadBudgets, saveBudget, editBudget, removeBudget, toggleBudgetActive,
      loadRecurring, addRecurring, editRecurring, removeRecurring,
      reorderAccounts, reorderCategories, reorderTags,
      copyDayTransactions, exportCsv, refresh,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
