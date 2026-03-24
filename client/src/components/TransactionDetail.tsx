import Modal from './Modal';
import type { Transaction } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
  onEdit?: (t: Transaction) => void;
  onDelete?: (id: number) => void;
}

export default function TransactionDetail({ transaction: t, onClose, onEdit, onDelete }: Props) {
  if (!t) return null;
  const isIncome = t.type === 'income';
  const isTransfer = t.type === 'transfer';
  const amountColor = isIncome ? 'text-emerald-500' : isTransfer ? 'text-blue-500' : 'text-red-500';
  const prefix = isIncome ? '+' : isTransfer ? '' : '-';
  const typeLabel = isIncome ? 'Income' : isTransfer ? 'Transfer' : 'Expense';
  const typeBg = isIncome ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : isTransfer ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
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
  );
}
