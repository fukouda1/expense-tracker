import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/formatters';
import type { RecurringTransaction } from '../types';

interface UpcomingItem extends RecurringTransaction {
  dueDate: string;
  daysUntil: number;
  isPast: boolean;
}

const DISMISSED_KEY = 'tracecash_recurring_dismissed';

function getDismissed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}'); }
  catch { return {}; }
}

function dismissItem(key: string) {
  const d = getDismissed();
  d[key] = Date.now();
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(d));
}

function cleanOldDismissals() {
  const d = getDismissed();
  const cutoff = Date.now() - 30 * 86400000;
  let changed = false;
  for (const k of Object.keys(d)) {
    if (d[k] < cutoff) { delete d[k]; changed = true; }
  }
  if (changed) localStorage.setItem(DISMISSED_KEY, JSON.stringify(d));
}

export default function RecurringPreview() {
  const { recurring, loadRecurring } = useData();
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, number>>(getDismissed);

  useEffect(() => { loadRecurring(); cleanOldDismissals(); }, []);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30 = new Date(today);
    next30.setDate(today.getDate() + 30);
    const past5 = new Date(today);
    past5.setDate(today.getDate() - 5);

    const items: UpcomingItem[] = [];
    for (const r of recurring) {
      let nextDate = new Date(r.next_date);

      if (nextDate < today && nextDate >= past5) {
        const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / 86400000);
        items.push({ ...r, dueDate: nextDate.toISOString().slice(0, 10), daysUntil, isPast: true });
      }

      nextDate = new Date(r.next_date);
      while (nextDate <= next30) {
        if (nextDate >= today) {
          const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / 86400000);
          items.push({ ...r, dueDate: nextDate.toISOString().slice(0, 10), daysUntil, isPast: false });
        }
        switch (r.recurrence_type) {
          case 'daily': nextDate = new Date(nextDate.setDate(nextDate.getDate() + 1)); break;
          case 'weekly': nextDate = new Date(nextDate.setDate(nextDate.getDate() + 7)); break;
          case 'monthly': nextDate = new Date(nextDate.setMonth(nextDate.getMonth() + 1)); break;
          case 'yearly': nextDate = new Date(nextDate.setFullYear(nextDate.getFullYear() + 1)); break;
        }
      }
    }

    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const filtered = items.filter(item => !dismissed[`${item.id}-${item.dueDate}`]);
    setUpcoming(filtered.slice(0, 10));
  }, [recurring, dismissed]);

  const handleDismiss = (id: number, dueDate: string) => {
    dismissItem(`${id}-${dueDate}`);
    setDismissed({ ...getDismissed() });
  };

  const handleCreate = (item: UpcomingItem) => {
    // Dismiss immediately, then navigate to Add Transaction pre-filled
    dismissItem(`${item.id}-${item.dueDate}`);
    setDismissed({ ...getDismissed() });

    const params = new URLSearchParams();
    params.set('type', item.type);
    params.set('amount', String(item.amount));
    if (item.category_id) params.set('categoryId', String(item.category_id));
    params.set('accountId', String(item.account_id));
    params.set('date', item.dueDate);
    params.set('time', new Date().toTimeString().slice(0, 5));
    if (item.notes) params.set('notes', item.notes);
    params.set('returnTo', '/');
    navigate(`/add?${params.toString()}`);
  };

  if (upcoming.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">📅 Upcoming Recurring</h2>
      <div className="space-y-2">
        {upcoming.map((r, i) => {
          const itemKey = `${r.id}-${r.dueDate}`;
          return (
            <div key={`${itemKey}-${i}`} className={`flex items-center justify-between gap-1.5 ${r.isPast ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  r.isPast ? 'bg-gray-400' :
                  r.daysUntil === 0 ? 'bg-red-500' :
                  r.daysUntil <= 3 ? 'bg-amber-500' : 'bg-gray-300'
                }`} />
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                  {r.category_name ?? r.type} · {r.account_name}
                  {r.isPast && <span className="text-[9px] text-gray-400 ml-1">(done)</span>}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-xs font-medium ${r.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {formatCurrency(r.amount)}
                </span>
                <span className="text-[10px] text-gray-400 w-10 text-right">
                  {r.isPast ? `${Math.abs(r.daysUntil)}d ago` :
                   r.daysUntil === 0 ? 'Today' :
                   r.daysUntil === 1 ? 'Tmrw' : `${r.daysUntil}d`}
                </span>
                {/* Create transaction button */}
                {!r.isPast && (
                  <button
                    onClick={() => handleCreate(r)}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors"
                    title="Open Add Transaction with these details"
                  >
                    + Add
                  </button>
                )}
                {/* Dismiss button */}
                <button
                  onClick={() => handleDismiss(r.id, r.dueDate)}
                  className="text-gray-400 hover:text-red-400 text-[10px] p-0.5 transition-colors"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
