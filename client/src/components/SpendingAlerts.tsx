import { useState, useEffect } from 'react';
import { get } from '../services/api';
import { formatCurrency } from '../utils/formatters';

interface Alert {
  categoryName: string;
  categoryIcon: string;
  thisWeek: number;
  weeklyAvg: number;
  pctAbove: number;
}

export default function SpendingAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    get<Alert[]>('/analytics/spending-alerts')
      .then(setAlerts)
      .catch(() => {});
  }, []);

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
