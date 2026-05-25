import { useState } from 'react';
import Modal from './Modal';
import AmountInput from './AmountInput';
import { formatCurrency } from '../utils/formatters';
import type { Category } from '../types';

interface SplitEntry {
  categoryId: number | null;
  amount: string;
  notes: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  totalAmount: number;
  categories: Category[];
  onSplit: (entries: { categoryId: number | null; amount: number; notes: string }[]) => void;
}

export default function SplitTransaction({ open, onClose, totalAmount, categories, onSplit }: Props) {
  const [entries, setEntries] = useState<SplitEntry[]>([
    { categoryId: null, amount: '', notes: '' },
    { categoryId: null, amount: '', notes: '' },
  ]);

  const allocated = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remaining = totalAmount - allocated;

  const updateEntry = (idx: number, field: keyof SplitEntry, value: unknown) => {
    const updated = [...entries];
    (updated[idx] as any)[field] = value;
    setEntries(updated);
  };

  const addEntry = () => setEntries([...entries, { categoryId: null, amount: '', notes: '' }]);

  const removeEntry = (idx: number) => {
    if (entries.length <= 2) return;
    setEntries(entries.filter((_, i) => i !== idx));
  };

  const handleSplit = () => {
    const valid = entries.filter(e => Number(e.amount) > 0).map(e => ({
      categoryId: e.categoryId, amount: Number(e.amount), notes: e.notes,
    }));
    if (valid.length < 2) return;
    onSplit(valid);
    onClose();
  };

  const inputClass = "w-full p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white";

  return (
    <Modal open={open} onClose={onClose} title="✂️ Split Transaction">
      <div className="space-y-3">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">Total Amount</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalAmount)}</p>
          <p className={`text-[10px] mt-1 font-medium ${remaining === 0 ? 'text-emerald-500' : remaining > 0 ? 'text-amber-500' : 'text-red-500'}`}>
            {remaining === 0 ? '✓ Fully allocated' : remaining > 0 ? `${formatCurrency(remaining)} remaining` : `${formatCurrency(Math.abs(remaining))} over!`}
          </p>
        </div>

        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className="flex gap-1.5 items-start bg-gray-50 dark:bg-gray-700/30 rounded-lg p-2">
              <div className="flex-1 space-y-1">
                <select value={e.categoryId ?? ''} onChange={ev => updateEntry(i, 'categoryId', ev.target.value ? Number(ev.target.value) : null)} className={inputClass}>
                  <option value="">Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
                <AmountInput value={e.amount} onChange={v => updateEntry(i, 'amount', v)}
                  placeholder="Amount" className={inputClass} />
                <input value={e.notes} onChange={ev => updateEntry(i, 'notes', ev.target.value)}
                  placeholder="Notes (optional)" className={inputClass} />
              </div>
              {entries.length > 2 && (
                <button onClick={() => removeEntry(i)} className="text-red-400 text-sm mt-1">✕</button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addEntry} className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-400">
          + Add Split
        </button>

        {remaining > 0 && entries.some(e => !e.amount) && (
          <button onClick={() => {
            const emptyIdx = entries.findIndex(e => !e.amount || Number(e.amount) === 0);
            if (emptyIdx >= 0) updateEntry(emptyIdx, 'amount', String(remaining));
          }} className="w-full py-1.5 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-[10px] font-medium">
            Auto-fill remaining {formatCurrency(remaining)}
          </button>
        )}

        <button onClick={handleSplit} disabled={remaining !== 0 || entries.filter(e => Number(e.amount) > 0).length < 2}
          className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium disabled:opacity-40">
          Split into {entries.filter(e => Number(e.amount) > 0).length} entries
        </button>
      </div>
    </Modal>
  );
}
