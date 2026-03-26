import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';

export default function CashFlowForecast() {
  const { getTransactionsByDate, getAccountBalances, recurring } = useData();
  const { dark } = useTheme();

  const [currentBalance, setCurrentBalance] = useState(0);
  const [avgDailyExpense, setAvgDailyExpense] = useState(0);
  const [avgDailyIncome, setAvgDailyIncome] = useState(0);
  const [monthlyRecurringExpense, setMonthlyRecurringExpense] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const compute = async () => {
      // Get current balance
      const balances = await getAccountBalances();
      const totalBalance = balances.reduce((s, b) => s + b.balance, 0);
      setCurrentBalance(totalBalance);

      // Get last 30 days of transactions for average daily rate
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const txs = await getTransactionsByDate(
        thirtyDaysAgo.toISOString().slice(0, 10),
        now.toISOString().slice(0, 10) + 'T23:59:59'
      );

      const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

      setAvgDailyExpense(totalExpense / 30);
      setAvgDailyIncome(totalIncome / 30);

      // Calculate monthly recurring expenses
      const recurringExp = recurring
        .filter(r => r.active && r.type === 'expense')
        .reduce((s, r) => {
          if (r.recurrence_type === 'daily') return s + r.amount * 30;
          if (r.recurrence_type === 'weekly') return s + r.amount * 4;
          if (r.recurrence_type === 'monthly') return s + r.amount;
          if (r.recurrence_type === 'yearly') return s + r.amount / 12;
          return s;
        }, 0);
      setMonthlyRecurringExpense(recurringExp);

      setLoaded(true);
    };

    compute();
  }, [getTransactionsByDate, getAccountBalances, recurring]);

  // Project 90 days into the future
  const projectionData = useMemo(() => {
    if (!loaded) return [];

    const data: { day: string; balance: number; label: string }[] = [];
    const dailyNet = avgDailyIncome - avgDailyExpense;
    // Add recurring expense impact spread daily
    const dailyRecurring = monthlyRecurringExpense / 30;
    const effectiveDailyChange = dailyNet - dailyRecurring;

    let balance = currentBalance;
    const today = new Date();

    for (let i = 0; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayStr = `Day ${i}`;

      data.push({
        day: i % 7 === 0 ? label : '',
        balance: Math.round(balance * 100) / 100,
        label,
      });

      balance += effectiveDailyChange;
    }

    return data;
  }, [loaded, currentBalance, avgDailyExpense, avgDailyIncome, monthlyRecurringExpense]);

  // Calculate days until zero
  const daysUntilZero = useMemo(() => {
    if (currentBalance <= 0) return 0;
    const dailyNet = avgDailyIncome - avgDailyExpense - (monthlyRecurringExpense / 30);
    if (dailyNet >= 0) return Infinity; // balance growing or stable
    return Math.ceil(currentBalance / Math.abs(dailyNet));
  }, [currentBalance, avgDailyExpense, avgDailyIncome, monthlyRecurringExpense]);

  if (!loaded) return null;

  const tooltipStyle = { background: dark ? '#1f2937' : '#fff', border: 'none', borderRadius: 8, fontSize: 11 };
  const gridStroke = dark ? '#374151' : '#e5e7eb';
  const axisStroke = dark ? '#6b7280' : '#9ca3af';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Cash Flow Forecast</h2>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <p className="text-[10px] text-gray-400 uppercase">Current Balance</p>
          <p className={`text-xs font-bold ${currentBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatCurrency(currentBalance)}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <p className="text-[10px] text-gray-400 uppercase">Avg Daily Net</p>
          <p className={`text-xs font-bold ${avgDailyIncome - avgDailyExpense >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatCurrency(avgDailyIncome - avgDailyExpense)}
          </p>
        </div>
      </div>

      {/* Forecast message */}
      <div className={`text-xs p-2 rounded-lg mb-3 ${
        daysUntilZero === Infinity
          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
          : daysUntilZero > 60
            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
      }`}>
        {daysUntilZero === Infinity
          ? 'Your balance is growing or stable at the current rate.'
          : daysUntilZero === 0
            ? 'Your balance is already at or below zero.'
            : `At current rate, your balance will reach ${formatCurrency(0)} in ${daysUntilZero} days.`}
      </div>

      {/* Projection chart */}
      {projectionData.length > 0 && (
        <div className="h-44">
          <ResponsiveContainer>
            <LineChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke={axisStroke} />
              <YAxis tick={{ fontSize: 9 }} stroke={axisStroke} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: any) => formatCurrency(Number(v))}
                labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.label ?? ''}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="balance"
                name="Projected Balance"
                stroke={daysUntilZero === Infinity ? '#10b981' : '#f59e0b'}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Details */}
      <div className="mt-2 space-y-1 text-[10px] text-gray-400">
        <div className="flex justify-between">
          <span>Avg daily expense (30d)</span>
          <span className="text-red-500 font-medium">{formatCurrency(avgDailyExpense)}</span>
        </div>
        <div className="flex justify-between">
          <span>Avg daily income (30d)</span>
          <span className="text-emerald-500 font-medium">{formatCurrency(avgDailyIncome)}</span>
        </div>
        {monthlyRecurringExpense > 0 && (
          <div className="flex justify-between">
            <span>Monthly recurring expenses</span>
            <span className="text-red-500 font-medium">{formatCurrency(monthlyRecurringExpense)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
