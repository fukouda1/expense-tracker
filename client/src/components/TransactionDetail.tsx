import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import Modal from './Modal';
import { useData } from '../contexts/DataContext';
import { post } from '../services/api';
import type { Transaction } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';

const isNative = Capacitor.isNativePlatform();

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
  onEdit?: (t: Transaction) => void;
  onDelete?: (id: number) => void;
}

interface SplitRow {
  amount: string;
  category_id: number | '';
}

export default function TransactionDetail({ transaction: t, onClose, onEdit, onDelete }: Props) {
  const navigate = useNavigate();
  const { categories, addTransaction, removeTransaction, refresh } = useData();
  const [showSplit, setShowSplit] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);

  if (!t) return null;
  const isIncome = t.type === 'income';
  const isTransfer = t.type === 'transfer';
  const amountColor = isIncome ? 'text-emerald-500' : isTransfer ? 'text-blue-500' : 'text-red-500';
  const prefix = isIncome ? '+' : isTransfer ? '' : '-';
  const typeLabel = isIncome ? 'Income' : isTransfer ? 'Transfer' : 'Expense';
  const typeBg = isIncome ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : isTransfer ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  const relevantCategories = categories.filter(c =>
    c.active && (c.type === 'both' || c.type === t.type)
  );

  const openSplitModal = () => {
    const halfAmount = (t.amount / 2).toFixed(2);
    const otherHalf = (t.amount - Number(halfAmount)).toFixed(2);
    setSplits([
      { amount: halfAmount, category_id: t.category_id ?? '' },
      { amount: otherHalf, category_id: '' },
    ]);
    setShowSplit(true);
  };

  const updateSplit = (index: number, field: keyof SplitRow, value: string | number) => {
    setSplits(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addSplitRow = () => {
    setSplits(prev => [...prev, { amount: '', category_id: '' }]);
  };

  const removeSplitRow = (index: number) => {
    if (splits.length <= 2) return;
    setSplits(prev => prev.filter((_, i) => i !== index));
  };

  const splitTotal = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const splitValid = splits.length >= 2
    && splits.every(s => Number(s.amount) > 0 && s.category_id !== '')
    && Math.abs(splitTotal - t.amount) < 0.01;

  const handleSplit = async () => {
    if (!splitValid) return;
    if (isNative) {
      // Native: delete original, create split transactions using DataContext
      await removeTransaction(t.id);
      for (const s of splits) {
        await addTransaction({
          amount: Number(s.amount), type: t.type,
          category_id: Number(s.category_id),
          account_id: t.account_id, to_account_id: t.to_account_id ?? null,
          date: t.date, notes: t.notes ?? '',
          account_name: t.account_name,
          category_name: undefined, category_icon: undefined, category_color: undefined,
          to_account_name: undefined, tags: [],
        });
      }
    } else {
      await post('/api/transactions/split', {
        id: t.id,
        splits: splits.map(s => ({ amount: Number(s.amount), category_id: Number(s.category_id) })),
      });
    }
    setShowSplit(false);
    await refresh();
    onClose();
  };

  return (
    <>
      <Modal open={!!t} onClose={onClose} title="Transaction Details">
        <div className="space-y-4">
          {/* Amount */}
          <div className="text-center py-3">
            <p className={`text-3xl font-bold ${amountColor}`}>{prefix}{formatCurrency(t.amount)}</p>
            <span className={`inline-block mt-2 px-3 py-0.5 rounded-full text-[11px] font-medium ${typeBg}`}>{typeLabel}</span>
          </div>

          {/* Details grid */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-3">
            {!isTransfer && t.category_name && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">Category</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span>{t.category_icon}</span> {t.category_name}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">{isTransfer ? 'From' : 'Account'}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{t.account_name}</span>
            </div>
            {isTransfer && t.to_account_name && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">To</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{t.to_account_name}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Date</span>
              <span className="text-sm text-gray-900 dark:text-white">{formatDateTime(t.date)}</span>
            </div>
            {t.notes && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</span>
                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap bg-white dark:bg-gray-800 rounded-lg p-2">{t.notes}</p>
              </div>
            )}
            {t.tags && t.tags.length > 0 && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tags</span>
                <div className="flex flex-wrap gap-1">
                  {t.tags.map(tag => (
                    <span key={tag.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const p = new URLSearchParams();
                p.set('type', t.type);
                p.set('amount', String(t.amount));
                if (t.category_id) p.set('categoryId', String(t.category_id));
                p.set('accountId', String(t.account_id));
                if (t.to_account_id) p.set('toAccountId', String(t.to_account_id));
                p.set('date', new Date().toISOString().slice(0, 10));
                p.set('time', new Date().toTimeString().slice(0, 5));
                if (t.notes) p.set('notes', t.notes);
                onClose();
                navigate(`/add?${p.toString()}`);
              }}
              className="flex-1 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-xl text-sm font-medium"
            >
              📋 Duplicate
            </button>
            {!isTransfer && (
              <button onClick={openSplitModal} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium">
                ✂️ Split
              </button>
            )}
            {onEdit && (
              <button onClick={() => { onEdit(t); onClose(); }} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium">
                ✏️ Edit
              </button>
            )}
            {onDelete && (
              <button onClick={() => { onDelete(t.id); onClose(); }} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">
                🗑️ Delete
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Split Transaction Modal */}
      <Modal open={showSplit} onClose={() => setShowSplit(false)} title="Split Transaction">
        <div className="space-y-4">
          <div className="text-center py-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">Original Amount</p>
            <p className={`text-2xl font-bold ${amountColor}`}>{prefix}{formatCurrency(t.amount)}</p>
          </div>

          <div className="space-y-2">
            {splits.map((split, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex-1 space-y-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount"
                    value={split.amount}
                    onChange={e => updateSplit(i, 'amount', e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                  />
                  <select
                    value={split.category_id}
                    onChange={e => updateSplit(i, 'category_id', Number(e.target.value))}
                    className="w-full p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">Select category...</option>
                    {relevantCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                {splits.length > 2 && (
                  <button onClick={() => removeSplitRow(i)} className="text-red-400 hover:text-red-500 text-lg px-1">×</button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addSplitRow}
            className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-500"
          >
            + Add Split
          </button>

          {/* Validation summary */}
          <div className={`text-center text-xs font-medium ${Math.abs(splitTotal - t.amount) < 0.01 ? 'text-emerald-500' : 'text-red-500'}`}>
            Split total: {formatCurrency(splitTotal)} / {formatCurrency(t.amount)}
            {Math.abs(splitTotal - t.amount) >= 0.01 && (
              <span className="block text-[10px] mt-0.5">
                {splitTotal > t.amount ? 'Over' : 'Under'} by {formatCurrency(Math.abs(splitTotal - t.amount))}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowSplit(false)}
              className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSplit}
              disabled={!splitValid}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
            >
              Split
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
