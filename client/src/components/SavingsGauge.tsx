import { formatCurrency } from '../utils/formatters';

interface Props {
  income: number;
  expense: number;
  compact?: boolean;
}

export default function SavingsGauge({ income, expense, compact }: Props) {
  const savings = income - expense;
  const rate = income > 0 ? Math.round((savings / income) * 100) : 0;
  const clampedRate = Math.max(-100, Math.min(100, rate));
  const isPositive = savings >= 0;

  const angle = ((clampedRate + 100) / 200) * 180;
  const radius = 60;
  const centerX = 70;
  const centerY = 70;
  const startAngle = Math.PI;
  const endAngle = startAngle - (angle * Math.PI / 180);
  const endX = centerX + radius * Math.cos(endAngle);
  const endY = centerY - radius * Math.sin(endAngle);
  const largeArc = angle > 180 ? 1 : 0;

  if (compact) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex flex-col items-center">
        <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Savings Rate</p>
        <svg width="100" height="58" viewBox="0 0 140 80">
          <path d="M 10 70 A 60 60 0 0 1 130 70" fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="8" strokeLinecap="round" />
          <path d={`M 10 70 A 60 60 0 ${largeArc} 1 ${endX} ${endY}`} fill="none" stroke={isPositive ? '#10b981' : '#ef4444'} strokeWidth="8" strokeLinecap="round" />
          <text x="70" y="58" textAnchor="middle" fill={isPositive ? '#10b981' : '#ef4444'} fontSize="22" fontWeight="bold">{rate}%</text>
        </svg>
        <div className="w-full space-y-0.5 mt-1">
          <div className="flex justify-between text-[9px]">
            <span className="text-gray-400">Income</span>
            <span className="text-emerald-500 font-semibold">{formatCurrency(income)}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-gray-400">Expense</span>
            <span className="text-red-500 font-semibold">{formatCurrency(expense)}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-gray-400">Saved</span>
            <span className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(savings)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Savings Rate</h2>
      <div className="flex items-center gap-4">
        <svg width="140" height="80" viewBox="0 0 140 80">
          <path d="M 10 70 A 60 60 0 0 1 130 70" fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="8" strokeLinecap="round" />
          <path d={`M 10 70 A 60 60 0 ${largeArc} 1 ${endX} ${endY}`} fill="none" stroke={isPositive ? '#10b981' : '#ef4444'} strokeWidth="8" strokeLinecap="round" />
          <text x="70" y="60" textAnchor="middle" fill={isPositive ? '#10b981' : '#ef4444'} fontSize="20" fontWeight="bold">{rate}%</text>
          <text x="70" y="75" textAnchor="middle" fill="#9ca3af" fontSize="9">savings rate</text>
        </svg>
        <div className="space-y-1.5">
          <div>
            <p className="text-[10px] text-gray-400">Income</p>
            <p className="text-xs font-semibold text-emerald-500">{formatCurrency(income)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Expense</p>
            <p className="text-xs font-semibold text-red-500">{formatCurrency(expense)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Saved</p>
            <p className={`text-xs font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(savings)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
