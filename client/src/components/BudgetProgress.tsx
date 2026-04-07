import type { Budget } from '../types';
import { formatCurrency, percentOf } from '../utils/formatters';

interface Props {
  budget: Budget;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleActive?: () => void;
}

export default function BudgetProgress({ budget, onEdit, onDelete, onToggleActive }: Props) {
  const spent = budget.spent ?? 0;
  const pct = percentOf(spent, budget.amount);
  const isOver = pct >= 100;
  const isWarning = pct >= 80;

  const barColor = isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';
  const pctColor = isOver ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
      {/* Header row: name + actions */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {budget.category_color && (
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: budget.category_color }} />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {budget.category_name ?? 'Overall Budget'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className={`text-xs font-bold ${pctColor}`}>{pct}%</span>
          {onToggleActive && (
            <button onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
              className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 touch-manipulation cursor-pointer ${budget.active !== false ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${budget.active !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          )}
          {(onEdit || onDelete) && (
            <div className="flex gap-1 ml-1">
              {onEdit && (
                <button onClick={onEdit} className="text-gray-400 hover:text-blue-500 text-xs p-0.5">✏️</button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-xs p-0.5">🗑️</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Budget vs Spent amounts */}
      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
        <span>{formatCurrency(spent)} of {formatCurrency(budget.amount)}</span>
        <span className={pctColor}>{formatCurrency(Math.max(budget.amount - spent, 0))} left</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Alert */}
      {isOver && (
        <p className="mt-1.5 text-[11px] text-red-500 font-medium">
          Over budget by {formatCurrency(spent - budget.amount)}!
        </p>
      )}
      {isWarning && !isOver && (
        <p className="mt-1.5 text-[11px] text-amber-500 font-medium">
          Approaching limit!
        </p>
      )}
    </div>
  );
}
