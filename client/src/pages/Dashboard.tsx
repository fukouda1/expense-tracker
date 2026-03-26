import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDisplay } from '../contexts/DisplayContext';
import { useToast } from '../components/Toast';
import TransactionCard from '../components/TransactionCard';
import TransactionDetail from '../components/TransactionDetail';
import ConfirmDialog from '../components/ConfirmDialog';
import BudgetProgress from '../components/BudgetProgress';
import PeriodNav from '../components/PeriodNav';
import DisplayOptionsModal from '../components/DisplayOptionsModal';
import PullToRefresh from '../components/PullToRefresh';
import EmptyState from '../components/EmptyState';
import RecurringPreview from '../components/RecurringPreview';
import QuickTemplateBar from '../components/QuickTemplates';
import SavingsGauge from '../components/SavingsGauge';
import SpendingAlerts from '../components/SpendingAlerts';
import { formatCurrency } from '../utils/formatters';
import type { CategorySummary, AccountBalance, Transaction } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const { transactions, budgets, loading, getAccountBalances, loadBudgets, getTransactionsByDate, removeTransaction, refresh } = useData();
  // All transactions for debt calculation (not period-filtered)
  const [allTxForDebt, setAllTxForDebt] = useState<Transaction[]>([]);
  const { dark, toggle } = useTheme();
  const { getPeriodRange, period, viewMode, periodLabel } = useDisplay();
  const { showToast } = useToast();

  const [monthlyTotal, setMonthlyTotal] = useState({ income: 0, expense: 0 });
  const [categoryData, setCategoryData] = useState<CategorySummary[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [balanceHidden, setBalanceHidden] = useState(() => localStorage.getItem('tracecash_hide_balance') === '1');
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [showDisplayOpts, setShowDisplayOpts] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    // Load all transactions for debt calculation
    getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59').then(setAllTxForDebt);
  }, [loading, transactions]);

  useEffect(() => {
    const load = async () => {
      const { from, to } = getPeriodRange();
      const [bals, txs] = await Promise.all([getAccountBalances(), getTransactionsByDate(from, to)]);
      const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      setMonthlyTotal({ income, expense });
      // Category breakdown
      const catMap = new Map<string, CategorySummary>();
      for (const t of txs.filter(tx => tx.type === 'expense' && tx.category_name)) {
        const key = String(t.category_id);
        const ex = catMap.get(key);
        if (ex) { ex.total += t.amount; ex.count++; }
        else catMap.set(key, { category_id: t.category_id!, category_name: t.category_name!, category_icon: t.category_icon ?? '📦', category_color: t.category_color ?? '#6b7280', total: t.amount, count: 1, percentage: 0 });
      }
      const cats = Array.from(catMap.values()).sort((a, b) => b.total - a.total);
      const gt = cats.reduce((s, c) => s + c.total, 0);
      cats.forEach(c => c.percentage = gt > 0 ? (c.total / gt) * 100 : 0);
      setCategoryData(cats);
      setBalances(bals);
      setRecentTx(txs.slice(0, 10));
      await loadBudgets(from.slice(0, 7));
    };
    if (!loading) load();
  }, [loading, period, viewMode, transactions]);

  const totalBalance = balances.reduce((s, b) => s + b.balance, 0);
  const avgDaily = useMemo(() => {
    if (!recentTx.length) return 0;
    const days = new Set(recentTx.filter(t => t.type === 'expense').map(t => t.date.slice(0, 10)));
    const totalExp = recentTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return days.size > 0 ? totalExp / days.size : 0;
  }, [recentTx]);

  // Biggest expense
  const biggestExpense = useMemo(() => {
    const expenses = recentTx.filter(t => t.type === 'expense');
    if (!expenses.length) return null;
    return expenses.reduce((max, t) => t.amount > max.amount ? t : max);
  }, [recentTx]);

  const toggleBalance = () => {
    setBalanceHidden(h => { const n = !h; localStorage.setItem('tracecash_hide_balance', n ? '1' : '0'); return n; });
  };

  const handleDeleteTx = (id: number) => {
    const tx = recentTx.find(t => t.id === id);
    setDeleteConfirm({ id, name: tx?.category_name ?? 'transaction' });
  };

  const confirmDeleteTx = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    setDeleteConfirm(null);
    await removeTransaction(id);
    showToast('Transaction deleted', 'undo', {
      onUndo: async () => { await refresh(); showToast('Data refreshed', 'info'); }
    });
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="px-4 pt-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">TraceCash</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Track your finances</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={toggle} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">{dark ? '☀️' : '🌙'}</button>
            <button onClick={() => setShowDisplayOpts(true)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800" title="Display options">
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M3 8h12M3 12h18M3 16h8M3 20h14" />
              </svg>
            </button>
          </div>
        </div>

        <PeriodNav />

        {/* Total Balance Card */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <p className="text-sm opacity-80">Total Balance</p>
            <button onClick={toggleBalance} className="opacity-70 hover:opacity-100 transition-opacity text-lg">{balanceHidden ? '🙈' : '👁️'}</button>
          </div>
          <p className="text-3xl font-bold mt-1">{balanceHidden ? '₱ ••••••' : formatCurrency(totalBalance)}</p>
          {!balanceHidden && (
            <div className="flex gap-3 mt-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              {balances.map(b => (
                <div key={b.account_id} className="text-xs flex-shrink-0 bg-white/15 rounded-lg px-2.5 py-1.5 min-w-[90px]">
                  <p className="opacity-80 text-[10px] truncate">{b.account_name}</p>
                  <p className="font-bold text-sm">{balanceHidden ? '••••' : formatCurrency(b.balance)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Period Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-2.5 sm:p-3 border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-[10px] text-gray-400 uppercase">Expense</p>
            <p className="text-xs sm:text-sm font-bold text-red-500">{formatCurrency(monthlyTotal.expense)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-2.5 sm:p-3 border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-[10px] text-gray-400 uppercase">Income</p>
            <p className="text-xs sm:text-sm font-bold text-emerald-500">{balanceHidden ? '••••' : formatCurrency(monthlyTotal.income)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-2.5 sm:p-3 border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-[10px] text-gray-400 uppercase">Balance</p>
            <p className={`text-xs sm:text-sm font-bold ${monthlyTotal.income - monthlyTotal.expense >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {balanceHidden ? '••••' : formatCurrency(monthlyTotal.income - monthlyTotal.expense)}
            </p>
          </div>
        </div>

        {/* Spending Alerts */}
        <SpendingAlerts />

        {/* Average Daily Spend + Biggest Expense */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
            <p className="text-[10px] text-gray-400 uppercase">Avg Daily Spend</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(avgDaily)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">per active day</p>
          </div>
          {biggestExpense && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
              <p className="text-[10px] text-gray-400 uppercase">🏆 Biggest Expense</p>
              <p className="text-sm font-bold text-red-500">{formatCurrency(biggestExpense.amount)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{biggestExpense.category_name}</p>
            </div>
          )}
        </div>

        {/* Savings Rate + Debts Card */}
        {(() => {
          const lent = allTxForDebt.filter(t => t.category_name === 'Lent Money').reduce((s, t) => s + t.amount, 0);
          const returned = allTxForDebt.filter(t => t.category_name === 'Lent Payment').reduce((s, t) => s + t.amount, 0);
          const borrowed = allTxForDebt.filter(t => t.category_name === 'Debt').reduce((s, t) => s + t.amount, 0);
          const paid = allTxForDebt.filter(t => t.category_name === 'Debt Payment').reduce((s, t) => s + t.amount, 0);
          const theyOwe = Math.max(0, lent - returned);
          const iOwe = Math.max(0, borrowed - paid);
          const hasSavings = monthlyTotal.income > 0;
          const hasDebts = theyOwe > 0 || iOwe > 0;
          if (!hasSavings && !hasDebts) return null;
          return (
            <div className="grid grid-cols-2 gap-2">
              {/* Savings */}
              {hasSavings ? (
                <SavingsGauge income={monthlyTotal.income} expense={monthlyTotal.expense} compact />
              ) : (
                <div />
              )}
              {/* Debts */}
              {hasDebts ? (
                <Link to="/debts" className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">💰</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">Debts</span>
                    <span className="text-gray-400 text-[10px] ml-auto">›</span>
                  </div>
                  <div className="space-y-1.5">
                    {theyOwe > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">Owed to you</p>
                        <p className="text-sm font-bold text-emerald-500">{formatCurrency(theyOwe)}</p>
                      </div>
                    )}
                    {iOwe > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">You owe</p>
                        <p className="text-sm font-bold text-red-500">{formatCurrency(iOwe)}</p>
                      </div>
                    )}
                  </div>
                </Link>
              ) : (
                <div />
              )}
            </div>
          );
        })()}

        {/* Budgets */}
        {budgets.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Budgets</h2>
              <Link to="/settings" className="text-xs text-emerald-600">Manage</Link>
            </div>
            <div className="space-y-2">
              {budgets.slice(0, 3).map(b => <BudgetProgress key={b.id} budget={b} />)}
            </div>
          </div>
        )}

        {/* Category Pie */}
        {categoryData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Spending by Category</h2>
            <div className="flex flex-col sm:flex-row items-center">
              <div className="w-36 h-36 sm:w-40 sm:h-40 flex-shrink-0">
                <ResponsiveContainer>
                  <PieChart><Pie data={categoryData} dataKey="total" nameKey="category_name" cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2}>
                    {categoryData.map((c, i) => <Cell key={i} fill={c.category_color} />)}
                  </Pie><Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: dark ? '#1f2937' : '#fff', border: 'none', borderRadius: 8 }} /></PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1 ml-0 sm:ml-4 mt-2 sm:mt-0 w-full">
                {categoryData.slice(0, 6).map(c => (
                  <div key={c.category_id} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.category_color }} />
                      <span className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{c.category_name}</span></div>
                    <span className="text-gray-500 font-medium">{formatCurrency(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Templates */}
        <QuickTemplateBar />

        {/* Upcoming Recurring */}
        <RecurringPreview />


        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Transactions</h2>
            <Link to="/transactions" className="text-xs text-emerald-600">See All</Link>
          </div>
          {recentTx.length === 0 ? (
            <EmptyState icon="💸" title="No transactions yet" subtitle="Tap + to add your first transaction" />
          ) : (
            <div className="space-y-2">
              {recentTx.map(t => (
                <TransactionCard
                  key={t.id}
                  transaction={t}
                  onClick={() => setDetailTx(t)}
                  onEdit={tx => navigate(`/add?edit=${tx.id}`)}
                  onDelete={id => handleDeleteTx(id)}
                />
              ))}
            </div>
          )}
        </div>

        <DisplayOptionsModal open={showDisplayOpts} onClose={() => setShowDisplayOpts(false)} />
        <TransactionDetail transaction={detailTx} onClose={() => setDetailTx(null)} onDelete={handleDeleteTx} />
        <ConfirmDialog
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={confirmDeleteTx}
          title="Delete Transaction"
          message={`Are you sure you want to delete this ${deleteConfirm?.name ?? 'transaction'}?`}
          confirmText="Delete"
          variant="danger"
        />
      </div>
    </PullToRefresh>
  );
}
