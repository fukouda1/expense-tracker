import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/formatters';
import type { RecurringTransaction } from '../types';

export default function RecurringPreview() {
  const { recurring, loadRecurring } = useData();
  const [upcoming, setUpcoming] = useState<(RecurringTransaction & { dueDate: string; daysUntil: number })[]>([]);

  useEffect(() => {
    loadRecurring();
  }, []);

  useEffect(() => {
    const today = new Date();
    const next30 = new Date(today);
    next30.setDate(today.getDate() + 30);

    const items: typeof upcoming = [];
    for (const r of recurring) {
      let nextDate = new Date(r.next_date);
      // Generate next occurrences within 30 days
      while (nextDate <= next30) {
        if (nextDate >= today) {
          const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / 86400000);
          items.push({ ...r, dueDate: nextDate.toISOString().slice(0, 10), daysUntil });
        }
        // Advance
        switch (r.recurrence_type) {
          case 'daily': nextDate = new Date(nextDate.setDate(nextDate.getDate() + 1)); break;
          case 'weekly': nextDate = new Date(nextDate.setDate(nextDate.getDate() + 7)); break;
          case 'monthly': nextDate = new Date(nextDate.setMonth(nextDate.getMonth() + 1)); break;
          case 'yearly': nextDate = new Date(nextDate.setFullYear(nextDate.getFullYear() + 1)); break;
        }
      }
    }
    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    setUpcoming(items.slice(0, 10));
  }, [recurring]);

  if (upcoming.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">📅 Upcoming Recurring</h2>
      <div className="space-y-2">
        {upcoming.map((r, i) => (
          <div key={`${r.id}-${r.dueDate}-${i}`} className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.daysUntil === 0 ? 'bg-red-500' : r.daysUntil <= 3 ? 'bg-amber-500' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                {r.category_name ?? r.type} · {r.account_name}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs font-medium ${r.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatCurrency(r.amount)}
              </span>
              <span className="text-[10px] text-gray-400">
                {r.daysUntil === 0 ? 'Today' : r.daysUntil === 1 ? 'Tomorrow' : `${r.daysUntil}d`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
