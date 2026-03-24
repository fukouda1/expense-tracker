import type { Budget } from '../types';
import { formatCurrency, percentOf } from '../utils/formatters';

interface Props {
  budget: Budget;
}

export default function BudgetProgress({ budget }: Props) {
  const spent = budget.spent ?? 0;
  const pct = percentOf(spent, budget.amount);
  const isOver = pct >= 100;
  const isWarning = pct >= 80;

  const barColor = isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {budget.category_name ?? 'Overall Budget'}
        </span>
        <span className={`text-xs font-semibold ${isOver ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-emerald-500'}`}>
          {pct}%
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        <span>{formatCurrency(spent)} spent</span>
        <span>{formatCurrency(Math.max(budget.amount - spent, 0))} left</span>
      </div>
      {isOver && (
        <div className="mt-1 text-xs text-red-500 font-medium">
          Over budget by {formatCurrency(spent - budget.amount)}!
        </div>
      )}
      {isWarning && !isOver && (
        <div className="mt-1 text-xs text-amber-500 font-medium">
          Approaching limit!
        </div>
      )}
    </div>
  );
}
