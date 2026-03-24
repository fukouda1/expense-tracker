import type { Transaction } from '../types';
import { formatCurrency, formatDate, formatTime } from '../utils/formatters';

interface Props {
  transaction: Transaction;
  onClick?: () => void;
  onEdit?: (t: Transaction) => void;
  onDelete?: (id: number) => void;
}

export default function TransactionCard({ transaction: t, onClick, onEdit, onDelete }: Props) {
  const isIncome = t.type === 'income';
  const isTransfer = t.type === 'transfer';
  const amountColor = isIncome ? 'text-emerald-600 dark:text-emerald-400'
    : isTransfer ? 'text-blue-600 dark:text-blue-400'
    : 'text-red-600 dark:text-red-400';
  const prefix = isIncome ? '+' : isTransfer ? '' : '-';

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 group cursor-pointer"
      onClick={onClick}
    >
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-base sm:text-lg flex-shrink-0"
        style={{ backgroundColor: (t.category_color ?? '#6b7280') + '20' }}
      >
        {t.category_icon ?? (isTransfer ? '🔄' : '📦')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
            {isTransfer
              ? `${t.account_name} → ${t.to_account_name}`
              : t.category_name ?? 'Uncategorized'}
          </span>
          <span className={`font-semibold text-xs sm:text-sm ${amountColor} whitespace-nowrap`}>
            {prefix}{formatCurrency(t.amount)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5 gap-1">
          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
            {t.account_name}{t.notes ? ` · ${t.notes}` : ''}
          </span>
          <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {formatDate(t.date)} {formatTime(t.date)}
          </span>
        </div>
      </div>
      {/* Actions: stop propagation so parent onClick doesn't fire */}
      {(onEdit || onDelete) && (
        <div className="flex gap-0.5 sm:gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onEdit && (
            <button onClick={e => { e.stopPropagation(); onEdit(t); }} className="p-1 sm:p-1.5 text-gray-400 hover:text-blue-500 rounded text-xs sm:text-sm">
              ✏️
            </button>
          )}
          {onDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete(t.id); }} className="p-1 sm:p-1.5 text-gray-400 hover:text-red-500 rounded text-xs sm:text-sm">
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  );
}
