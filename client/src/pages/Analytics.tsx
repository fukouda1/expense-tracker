import { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, AreaChart, Area,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDisplay } from '../contexts/DisplayContext';
import PeriodNav from '../components/PeriodNav';
import DisplayOptionsModal from '../components/DisplayOptionsModal';
import { formatCurrency } from '../utils/formatters';
import SavingsGauge from '../components/SavingsGauge';
import CategoryTrend from '../components/CategoryTrend';
import CashFlowForecast from '../components/CashFlowForecast';
import type { CategorySummary, MonthlySummary, DailySummary, AccountBalance } from '../types';
import * as api from '../services/api';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

type Tab = 'expense' | 'income' | 'flow' | 'accounts';

interface AccountAnalysis {
  account_id: number;
  account_name: string;
  account_icon: string;
  account_color: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export default function Analytics() {
  const { categories, accounts, tags, getCategoryBreakdown, getMonthlyTrend, getTopCategories,
    getWeeklyComparison, getDailySummaries, getAccountBalances, getTransactionsByDate } = useData();
  const { dark } = useTheme();
  const { period, viewMode, getPeriodRange, periodLabel } = useDisplay();

  const [tab, setTab] = useState<Tab>('expense');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [trendMonths, setTrendMonths] = useState<6 | 12 | 24>(6);
  const [showDisplayOpts, setShowDisplayOpts] = useState(false);
  const [yoyData, setYoyData] = useState<{ thisYear: number; lastYear: number; pctChange: number } | null>(null);
  const [monthlyComparison, setMonthlyComparison] = useState<{ name: string; icon: string; current: number; previous: number; pctChange: number }[]>([]);
  const [dailyAvgByCat, setDailyAvgByCat] = useState<{ name: string; icon: string; avgDaily: number; activeDays: number }[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const analyticsRef = useRef<HTMLDivElement>(null);

  // Data states
  const [expenseCats, setExpenseCats] = useState<CategorySummary[]>([]);
  const [incomeCats, setIncomeCats] = useState<CategorySummary[]>([]);
  const [topExpenseCats, setTopExpenseCats] = useState<CategorySummary[]>([]);
  const [dailyData, setDailyData] = useState<DailySummary[]>([]);
  const [trend, setTrend] = useState<MonthlySummary[]>([]);
  const [accountData, setAccountData] = useState<AccountAnalysis[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [weekComp, setWeekComp] = useState({ thisWeek: 0, lastWeek: 0 });

  useEffect(() => {
    const load = async () => {
      const { from, to } = getPeriodRange();
      if (tab === 'expense') {
        const [cats, top, wk] = await Promise.all([
          getCategoryBreakdown(from, to),
          getTopCategories(from, to, 10),
          getWeeklyComparison(),
        ]);
        setExpenseCats(cats);
        setTopExpenseCats(top);
        setWeekComp(wk);

        // Monthly Comparison: fetch previous period data
        try {
          const fromDate = new Date(from);
          const toDate = new Date(to.replace('T23:59:59', ''));
          const periodMs = toDate.getTime() - fromDate.getTime();
          const prevTo = new Date(fromDate.getTime() - 1);
          const prevFrom = new Date(prevTo.getTime() - periodMs);
          const prevTxs = await getTransactionsByDate(
            prevFrom.toISOString().slice(0, 10),
            prevTo.toISOString().slice(0, 10) + 'T23:59:59'
          );

          // Build previous period category totals
          const prevCatMap = new Map<string, number>();
          for (const t of prevTxs.filter(tx => tx.type === 'expense' && tx.category_name)) {
            prevCatMap.set(t.category_name!, (prevCatMap.get(t.category_name!) ?? 0) + t.amount);
          }

          // Build comparison table
          const allCatNames = new Set<string>();
          cats.forEach(c => allCatNames.add(c.category_name));
          prevCatMap.forEach((_, name) => allCatNames.add(name));

          const currentCatMap = new Map<string, { total: number; icon: string }>();
          cats.forEach(c => currentCatMap.set(c.category_name, { total: c.total, icon: c.category_icon }));

          const comparison = Array.from(allCatNames).map(name => {
            const current = currentCatMap.get(name)?.total ?? 0;
            const previous = prevCatMap.get(name) ?? 0;
            const icon = currentCatMap.get(name)?.icon ?? '📦';
            const pctChange = previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
            return { name, icon, current, previous, pctChange };
          }).filter(c => c.current > 0 || c.previous > 0)
            .sort((a, b) => b.current - a.current);

          setMonthlyComparison(comparison);
        } catch {
          setMonthlyComparison([]);
        }

        // Daily Average by Category
        try {
          const currentTxs = await getTransactionsByDate(from, to);
          const catDays = new Map<string, { total: number; icon: string; days: Set<string> }>();
          for (const t of currentTxs.filter(tx => tx.type === 'expense' && tx.category_name)) {
            const entry = catDays.get(t.category_name!);
            const day = t.date.slice(0, 10);
            if (entry) {
              entry.total += t.amount;
              entry.days.add(day);
            } else {
              catDays.set(t.category_name!, { total: t.amount, icon: t.category_icon ?? '📦', days: new Set([day]) });
            }
          }
          const dailyAvgs = Array.from(catDays.entries())
            .map(([name, data]) => ({
              name,
              icon: data.icon,
              avgDaily: data.total / data.days.size,
              activeDays: data.days.size,
            }))
            .sort((a, b) => b.avgDaily - a.avgDaily);
          setDailyAvgByCat(dailyAvgs);
        } catch {
          setDailyAvgByCat([]);
        }

        // Year-over-year comparison
        try {
          const thisMonthKey = from.slice(0, 7);
          const [y, m] = thisMonthKey.split('-').map(Number);
          const lastYearMonth = `${y - 1}-${String(m).padStart(2, '0')}`;
          const lastYearFrom = `${lastYearMonth}-01`;
          const lastDay = new Date(y - 1, m, 0).getDate();
          const lastYearTo = `${lastYearMonth}-${lastDay}T23:59:59`;
          const lastYearTxs = await getTransactionsByDate(lastYearFrom, lastYearTo);
          const lastYearExp = lastYearTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          const thisYearExp = cats.reduce((s, c) => s + c.total, 0);
          const pctChange = lastYearExp > 0 ? ((thisYearExp - lastYearExp) / lastYearExp * 100) : 0;
          setYoyData({ thisYear: thisYearExp, lastYear: lastYearExp, pctChange });
        } catch { setYoyData(null); }
      } else if (tab === 'income') {
        if (isNative) {
          // Compute income categories locally from SQLite transactions
          const txs = await getTransactionsByDate(from, to);
          const catMap = new Map<string, CategorySummary>();
          for (const t of txs.filter(tx => tx.type === 'income' && tx.category_name)) {
            const key = String(t.category_id);
            const ex = catMap.get(key);
            if (ex) { ex.total += t.amount; ex.count++; }
            else catMap.set(key, { category_id: t.category_id!, category_name: t.category_name!, category_icon: t.category_icon ?? '📦', category_color: t.category_color ?? '#6b7280', total: t.amount, count: 1, percentage: 0 });
          }
          const cats = Array.from(catMap.values()).sort((a, b) => b.total - a.total);
          const gt = cats.reduce((s, c) => s + c.total, 0);
          cats.forEach(c => c.percentage = gt > 0 ? (c.total / gt) * 100 : 0);
          setIncomeCats(cats);
        } else {
          const res = await api.get<CategorySummary[]>(`/api/analytics/income-categories?from=${from}&to=${to}`);
          setIncomeCats(res);
        }
      } else if (tab === 'flow') {
        // Get daily data for current period + monthly trend
        const txs = await getTransactionsByDate(from, to);
        // Build daily summaries from transactions
        const dayMap = new Map<string, DailySummary>();
        for (const t of txs) {
          const d = t.date.slice(0, 10);
          if (!dayMap.has(d)) dayMap.set(d, { date: d, total_income: 0, total_expense: 0, total_transfer: 0, count: 0 });
          const entry = dayMap.get(d)!;
          entry.count++;
          if (t.type === 'income') entry.total_income += t.amount;
          else if (t.type === 'expense') entry.total_expense += t.amount;
          else entry.total_transfer += t.amount;
        }
        setDailyData(Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)));
        const tr = await getMonthlyTrend(trendMonths);
        setTrend(tr);
      } else if (tab === 'accounts') {
        if (isNative) {
          // Compute account analysis locally from SQLite transactions
          const [txs, bals] = await Promise.all([getTransactionsByDate(from, to), getAccountBalances()]);
          const accountMap = new Map<number, AccountAnalysis>();
          for (const t of txs) {
            if (!accountMap.has(t.account_id)) {
              const acc = accounts.find(a => a.id === t.account_id);
              accountMap.set(t.account_id, { account_id: t.account_id, account_name: t.account_name, account_icon: acc?.icon ?? '💰', account_color: acc?.color ?? '#6b7280', income: 0, expense: 0, net: 0, count: 0 } as AccountAnalysis);
            }
            const entry = accountMap.get(t.account_id)!;
            if (t.type === 'income') entry.income += t.amount;
            else if (t.type === 'expense') entry.expense += t.amount;
            entry.net = entry.income - entry.expense;
            entry.count++;
          }
          setAccountData(Array.from(accountMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)));
          setBalances(bals);
        } else {
          const [accs, bals] = await Promise.all([
            api.get<AccountAnalysis[]>(`/api/analytics/account-analysis?from=${from}&to=${to}`),
            getAccountBalances(),
          ]);
          setAccountData(accs);
          setBalances(bals);
        }
      }
    };
    load();
  }, [tab, period, viewMode, trendMonths]);

  const totalExpense = expenseCats.reduce((s, c) => s + c.total, 0);
  const totalIncome = incomeCats.reduce((s, c) => s + c.total, 0);

  const tooltipStyle = { background: dark ? '#1f2937' : '#fff', border: 'none', borderRadius: 8, fontSize: 11 };
  const gridStroke = dark ? '#374151' : '#e5e7eb';
  const axisStroke = dark ? '#6b7280' : '#9ca3af';

  const cumulativeFlow = useMemo(() => {
    let cumExpense = 0, cumIncome = 0;
    return dailyData.map(d => {
      cumExpense += d.total_expense;
      cumIncome += d.total_income;
      return {
        date: d.date.slice(5),
        expense: d.total_expense,
        income: d.total_income,
        cumExpense: Math.round(cumExpense * 100) / 100,
        cumIncome: Math.round(cumIncome * 100) / 100,
      };
    });
  }, [dailyData]);

  const copySummary = async () => {
    const lines: string[] = [];
    lines.push(`TraceCash Analytics — ${periodLabel}`);
    lines.push('');
    if (tab === 'expense') {
      lines.push(`Total Expense: ${formatCurrency(totalExpense)}`);
      lines.push('');
      lines.push('Category Breakdown:');
      expenseCats.forEach(c => {
        lines.push(`  ${c.category_icon} ${c.category_name}: ${formatCurrency(c.total)} (${c.percentage.toFixed(1)}%)`);
      });
    } else if (tab === 'income') {
      lines.push(`Total Income: ${formatCurrency(totalIncome)}`);
      lines.push('');
      lines.push('Income Sources:');
      incomeCats.forEach(c => {
        lines.push(`  ${c.category_icon} ${c.category_name}: ${formatCurrency(c.total)} (${c.percentage.toFixed(1)}%)`);
      });
    } else if (tab === 'flow') {
      const periodIncome = cumulativeFlow.reduce((s, d) => s + d.income, 0);
      const periodExpense = cumulativeFlow.reduce((s, d) => s + d.expense, 0);
      lines.push(`Income: ${formatCurrency(periodIncome)}`);
      lines.push(`Expense: ${formatCurrency(periodExpense)}`);
      lines.push(`Net: ${formatCurrency(periodIncome - periodExpense)}`);
      if (periodIncome > 0) {
        lines.push(`Savings Rate: ${Math.round(((periodIncome - periodExpense) / periodIncome) * 100)}%`);
      }
    } else if (tab === 'accounts') {
      lines.push('Account Balances:');
      balances.forEach(b => {
        lines.push(`  ${b.account_name}: ${formatCurrency(b.balance)}`);
      });
      lines.push(`  Total: ${formatCurrency(balances.reduce((s, b) => s + b.balance, 0))}`);
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = lines.join('\n');
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const tabs: { value: Tab; label: string; icon: string }[] = [
    { value: 'expense', label: 'Expense', icon: '📉' },
    { value: 'income', label: 'Income', icon: '📈' },
    { value: 'flow', label: 'Flow', icon: '📊' },
    { value: 'accounts', label: 'Accounts', icon: '🏦' },
  ];

  return (
    <div ref={analyticsRef} className="px-4 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Analytics</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copySummary}
            className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              copySuccess
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}
          >
            {copySuccess ? '✓ Copied' : '📋 Copy Summary'}
          </button>
          <button onClick={() => setShowDisplayOpts(true)} className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">⚙️</button>
        </div>
      </div>

      <PeriodNav />

      {/* Tab Selector */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${tab === t.value ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tag Filter */}
      {tags.filter(t => t.active !== false).length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setSelectedTagIds([])}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
              selectedTagIds.length === 0 ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}
          >
            All Tags
          </button>
          {tags.filter(t => t.active !== false).map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTagIds(prev =>
                prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
              )}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                selectedTagIds.includes(t.id) ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
              style={selectedTagIds.includes(t.id) ? { backgroundColor: t.color } : undefined}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* ═══ EXPENSE OVERVIEW ═══ */}
      {tab === 'expense' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 col-span-1">
              <p className="text-[10px] text-gray-400 uppercase">Total</p>
              <p className="text-base sm:text-lg font-bold text-red-500">{formatCurrency(totalExpense)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
              <p className="text-[10px] text-gray-400 uppercase">This Week</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(weekComp.thisWeek)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
              <p className="text-[10px] text-gray-400 uppercase">Last Week</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(weekComp.lastWeek)}</p>
              {weekComp.lastWeek > 0 && (
                <p className={`text-[10px] font-medium ${weekComp.thisWeek > weekComp.lastWeek ? 'text-red-500' : 'text-emerald-500'}`}>
                  {weekComp.thisWeek > weekComp.lastWeek ? '▲' : '▼'} {Math.abs(Math.round((weekComp.thisWeek - weekComp.lastWeek) / weekComp.lastWeek * 100))}%
                </p>
              )}
            </div>
          </div>
          {expenseCats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Expense Breakdown</h2>
              <div className="flex flex-col sm:flex-row items-center">
                <div className="w-36 h-36 sm:w-40 sm:h-40 flex-shrink-0">
                  <ResponsiveContainer><PieChart><Pie data={expenseCats} dataKey="total" nameKey="category_name" cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2}>
                    {expenseCats.map((c, i) => <Cell key={i} fill={c.category_color} />)}
                  </Pie><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} /></PieChart></ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1 ml-0 sm:ml-4 mt-2 sm:mt-0 w-full">
                  {expenseCats.slice(0, 7).map(c => (
                    <div key={c.category_id} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.category_color }} />
                        <span className="text-gray-700 dark:text-gray-300 truncate">{c.category_icon} {c.category_name}</span></div>
                      <span className="text-gray-500 font-medium whitespace-nowrap ml-2">{formatCurrency(c.total)} ({c.percentage.toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Year-over-Year */}
          {yoyData && yoyData.lastYear > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
              <h2 className="text-xs font-semibold text-gray-900 dark:text-white mb-2">📅 Year-over-Year</h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400">This Period</p><p className="text-xs font-bold text-gray-900 dark:text-white">{formatCurrency(yoyData.thisYear)}</p></div>
                <div><p className="text-[10px] text-gray-400">Last Year</p><p className="text-xs font-bold text-gray-900 dark:text-white">{formatCurrency(yoyData.lastYear)}</p></div>
                <div><p className="text-[10px] text-gray-400">Change</p><p className={`text-xs font-bold ${yoyData.pctChange > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{yoyData.pctChange > 0 ? '▲' : '▼'} {Math.abs(yoyData.pctChange).toFixed(1)}%</p></div>
              </div>
            </div>
          )}

          {/* Monthly Comparison */}
          {monthlyComparison.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Monthly Comparison</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 uppercase text-[9px]">
                      <th className="text-left pb-2 font-medium">Category</th>
                      <th className="text-right pb-2 font-medium">This Period</th>
                      <th className="text-right pb-2 font-medium">Previous</th>
                      <th className="text-right pb-2 font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {monthlyComparison.map(c => (
                      <tr key={c.name}>
                        <td className="py-1.5 text-gray-700 dark:text-gray-300">
                          <span className="mr-1">{c.icon}</span>{c.name}
                        </td>
                        <td className="py-1.5 text-right text-gray-900 dark:text-white font-medium">
                          {formatCurrency(c.current)}
                        </td>
                        <td className="py-1.5 text-right text-gray-500">
                          {formatCurrency(c.previous)}
                        </td>
                        <td className={`py-1.5 text-right font-bold ${
                          c.pctChange > 0 ? 'text-red-500' : c.pctChange < 0 ? 'text-emerald-500' : 'text-gray-400'
                        }`}>
                          {c.previous === 0 && c.current > 0 ? 'New' :
                            c.pctChange === 0 ? '—' :
                            `${c.pctChange > 0 ? '▲' : '▼'} ${Math.abs(c.pctChange).toFixed(0)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daily Average by Category */}
          {dailyAvgByCat.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Daily Average by Category</h2>
              <div className="space-y-1.5">
                {dailyAvgByCat.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-700 dark:text-gray-300">
                      {c.icon} {c.name}
                    </span>
                    <span className="text-gray-500">
                      <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(c.avgDaily)}</span>
                      <span className="text-gray-400">/day</span>
                      <span className="text-[10px] text-gray-400 ml-1">({c.activeDays} day{c.activeDays !== 1 ? 's' : ''} active)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category Trend */}
          <CategoryTrend categories={categories} />

          {topExpenseCats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Top Spending</h2>
              <div className="space-y-2">
                {topExpenseCats.map(c => (
                  <div key={c.category_id}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-700 dark:text-gray-300">{c.category_icon} {c.category_name}</span>
                      <span className="text-gray-500 font-medium">{formatCurrency(c.total)}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, backgroundColor: c.category_color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ INCOME OVERVIEW ═══ */}
      {tab === 'income' && (
        <div className="space-y-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase">Total Income</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{formatCurrency(totalIncome)}</p>
          </div>
          {incomeCats.length > 0 ? (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Income Breakdown</h2>
                <div className="flex flex-col sm:flex-row items-center">
                  <div className="w-36 h-36 sm:w-40 sm:h-40 flex-shrink-0">
                    <ResponsiveContainer><PieChart><Pie data={incomeCats} dataKey="total" nameKey="category_name" cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2}>
                      {incomeCats.map((c, i) => <Cell key={i} fill={c.category_color} />)}
                    </Pie><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} /></PieChart></ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1 ml-0 sm:ml-4 mt-2 sm:mt-0 w-full">
                    {incomeCats.map(c => (
                      <div key={c.category_id} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.category_color }} />
                          <span className="text-gray-700 dark:text-gray-300 truncate">{c.category_icon} {c.category_name}</span></div>
                        <span className="text-gray-500 font-medium whitespace-nowrap ml-2">{formatCurrency(c.total)} ({c.percentage.toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Income Sources</h2>
                <div className="space-y-2">
                  {incomeCats.map(c => (
                    <div key={c.category_id}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-gray-700 dark:text-gray-300">{c.category_icon} {c.category_name}</span>
                        <span className="text-gray-500 font-medium">{formatCurrency(c.total)}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, backgroundColor: c.category_color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-400 py-8 text-sm">No income in this period</div>
          )}
        </div>
      )}

      {/* ═══ FLOW ═══ */}
      {tab === 'flow' && (
        <div className="space-y-3">
          {/* Savings Rate */}
          {(() => {
            const periodIncome = cumulativeFlow.reduce((s, d) => s + d.income, 0);
            const periodExpense = cumulativeFlow.reduce((s, d) => s + d.expense, 0);
            return periodIncome > 0 ? <SavingsGauge income={periodIncome} expense={periodExpense} /> : null;
          })()}
          {cumulativeFlow.length > 0 && (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Expense Flow</h2>
                <div className="h-44"><ResponsiveContainer><AreaChart data={cumulativeFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="date" tick={{ fontSize: 9 }} stroke={axisStroke} />
                  <YAxis tick={{ fontSize: 9 }} stroke={axisStroke} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="cumExpense" name="Cumulative Expense" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
                </AreaChart></ResponsiveContainer></div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Income Flow</h2>
                <div className="h-44"><ResponsiveContainer><AreaChart data={cumulativeFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="date" tick={{ fontSize: 9 }} stroke={axisStroke} />
                  <YAxis tick={{ fontSize: 9 }} stroke={axisStroke} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="cumIncome" name="Cumulative Income" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
                </AreaChart></ResponsiveContainer></div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Daily Breakdown</h2>
                <div className="h-44"><ResponsiveContainer><BarChart data={cumulativeFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="date" tick={{ fontSize: 9 }} stroke={axisStroke} />
                  <YAxis tick={{ fontSize: 9 }} stroke={axisStroke} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="income" name="Income" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart></ResponsiveContainer></div>
              </div>
            </>
          )}
          {trend.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Monthly Trend</h2>
                <div className="flex gap-1">
                  {([6, 12, 24] as const).map(n => (
                    <button key={n} onClick={() => setTrendMonths(n)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${trendMonths === n ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                      {n === 6 ? '6M' : n === 12 ? '1Y' : '2Y'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-48"><ResponsiveContainer><LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="month" tick={{ fontSize: 9 }} stroke={axisStroke} />
                <YAxis tick={{ fontSize: 9 }} stroke={axisStroke} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="total_expense" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="total_income" name="Income" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart></ResponsiveContainer></div>
            </div>
          )}

          {/* Cash Flow Forecast */}
          <CashFlowForecast />
        </div>
      )}

      {/* ═══ ACCOUNT ANALYSIS ═══ */}
      {tab === 'accounts' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Current Balances</h2>
            <div className="space-y-2">
              {balances.map(b => (
                <div key={b.account_id} className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 dark:text-gray-300">{b.account_name}</span>
                  <span className={`text-xs font-bold ${b.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(b.balance)}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-900 dark:text-white">Total</span>
                <span className="text-sm font-bold text-emerald-600">{formatCurrency(balances.reduce((s, b) => s + b.balance, 0))}</span>
              </div>
            </div>
          </div>
          {accountData.length > 0 && (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Activity — {periodLabel}</h2>
                <div className="space-y-3">
                  {accountData.map(a => (
                    <div key={a.account_id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">{a.account_icon} {a.account_name}</span>
                        <span className="text-[10px] text-gray-400">{a.count} txn{a.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-[10px] text-gray-400">Income</p><p className="text-xs font-bold text-emerald-500">{formatCurrency(a.income)}</p></div>
                        <div><p className="text-[10px] text-gray-400">Expense</p><p className="text-xs font-bold text-red-500">{formatCurrency(a.expense)}</p></div>
                        <div><p className="text-[10px] text-gray-400">Net</p><p className={`text-xs font-bold ${a.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(a.net)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Spending by Account</h2>
                <div className="h-48"><ResponsiveContainer><PieChart>
                  <Pie data={accountData.filter(a => a.expense > 0)} dataKey="expense" nameKey="account_name" cx="50%" cy="50%" outerRadius={70} innerRadius={45} paddingAngle={2}>
                    {accountData.filter(a => a.expense > 0).map((a, i) => <Cell key={i} fill={a.account_color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </PieChart></ResponsiveContainer></div>
              </div>
            </>
          )}
        </div>
      )}

      <DisplayOptionsModal open={showDisplayOpts} onClose={() => setShowDisplayOpts(false)} />
    </div>
  );
}
