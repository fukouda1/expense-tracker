import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/formatters';

interface Alert {
  categoryName: string;
  categoryIcon: string;
  thisWeek: number;
  weeklyAvg: number;
  pctAbove: number;
}

export default function SpendingAlerts() {
  const { getTransactionsByDate } = useData();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const compute = async () => {
      const now = new Date();
      // Current week start (Sunday)
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - now.getDay());
      thisWeekStart.setHours(0, 0, 0, 0);

      // 4 weeks ago start
      const fourWeeksAgo = new Date(thisWeekStart);
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const thisWeekFrom = thisWeekStart.toISOString().slice(0, 10);
      const thisWeekTo = now.toISOString().slice(0, 10) + 'T23:59:59';
      const fourWeeksFrom = fourWeeksAgo.toISOString().slice(0, 10);
      const fourWeeksTo = new Date(thisWeekStart.getTime() - 1).toISOString().slice(0, 10) + 'T23:59:59';

      const [thisWeekTxs, prevTxs] = await Promise.all([
        getTransactionsByDate(thisWeekFrom, thisWeekTo),
        getTransactionsByDate(fourWeeksFrom, fourWeeksTo),
      ]);

      // Aggregate this week by category
      const thisWeekByCat = new Map<string, { total: number; name: string; icon: string }>();
      for (const tx of thisWeekTxs.filter(t => t.type === 'expense' && t.category_name)) {
        const key = String(tx.category_id);
        const entry = thisWeekByCat.get(key);
        if (entry) entry.total += tx.amount;
        else thisWeekByCat.set(key, { total: tx.amount, name: tx.category_name!, icon: tx.category_icon ?? '📦' });
      }

      // Aggregate previous 4 weeks by category
      const prevByCat = new Map<string, number>();
      for (const tx of prevTxs.filter(t => t.type === 'expense' && t.category_name)) {
        const key = String(tx.category_id);
        prevByCat.set(key, (prevByCat.get(key) ?? 0) + tx.amount);
      }

      // Compare
      const result: Alert[] = [];
      for (const [catId, data] of thisWeekByCat) {
        const prev4WeekTotal = prevByCat.get(catId) ?? 0;
        const weeklyAvg = prev4WeekTotal / 4;
        if (weeklyAvg > 0) {
          const pctAbove = ((data.total - weeklyAvg) / weeklyAvg) * 100;
          if (pctAbove > 30) {
            result.push({
              categoryName: data.name,
              categoryIcon: data.icon,
              thisWeek: data.total,
              weeklyAvg,
              pctAbove: Math.round(pctAbove),
            });
          }
        }
      }

      result.sort((a, b) => b.pctAbove - a.pctAbove);
      setAlerts(result);
    };

    compute();
  }, [getTransactionsByDate]);

  if (dismissed || alerts.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800 relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-300">Spending Alerts</h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 text-sm leading-none"
          aria-label="Dismiss alerts"
        >
          &times;
        </button>
      </div>
      <div className="space-y-1.5">
        {alerts.map(a => (
          <div key={a.categoryName} className="text-[11px] text-amber-900 dark:text-amber-200">
            <span className="font-medium">
              {a.categoryIcon} {a.categoryName}
            </span>{' '}
            spending is{' '}
            <span className="font-bold text-red-600 dark:text-red-400">{a.pctAbove}% above</span>{' '}
            average this week
            <span className="text-amber-600 dark:text-amber-400 ml-1">
              ({formatCurrency(a.thisWeek)} vs avg {formatCurrency(a.weeklyAvg)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
