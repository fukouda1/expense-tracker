import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import type { Category } from '../types';

interface Props {
  categories: Category[];
}

export default function CategoryTrend({ categories }: Props) {
  const { getMonthlyTrend, getTransactionsByDate } = useData();
  const { dark } = useTheme();
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [trendData, setTrendData] = useState<{ month: string; total: number }[]>([]);

  const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both');

  useEffect(() => {
    if (!selectedCatId) return;
    const loadTrend = async () => {
      // Get last 12 months of data for this category
      const now = new Date();
      const months: { month: string; total: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const from = `${m}-01`;
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const to = `${m}-${lastDay}T23:59:59`;
        const txs = await getTransactionsByDate(from, to);
        const total = txs.filter(t => t.category_id === selectedCatId && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        months.push({ month: m.slice(2), total });
      }
      setTrendData(months);
    };
    loadTrend();
  }, [selectedCatId]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Category Trend</h2>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
        {expenseCats.slice(0, 10).map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCatId(selectedCatId === c.id ? null : c.id)}
            className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0 transition-all ${
              selectedCatId === c.id ? 'text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
            }`}
            style={selectedCatId === c.id ? { backgroundColor: c.color } : undefined}
          >
            {c.icon} {c.name}
          </button>
        ))}
      </div>
      {selectedCatId && trendData.length > 0 ? (
        <div className="h-40">
          <ResponsiveContainer>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} stroke={dark ? '#6b7280' : '#9ca3af'} />
              <YAxis tick={{ fontSize: 9 }} stroke={dark ? '#6b7280' : '#9ca3af'} />
              <Tooltip
                contentStyle={{ background: dark ? '#1f2937' : '#fff', border: 'none', borderRadius: 8, fontSize: 11 }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Line type="monotone" dataKey="total" stroke={categories.find(c => c.id === selectedCatId)?.color ?? '#10b981'} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-6">Select a category to see its 12-month trend</p>
      )}
    </div>
  );
}
