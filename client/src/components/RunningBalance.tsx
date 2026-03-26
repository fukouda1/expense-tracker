import type { Transaction } from '../types';
import { formatCurrency } from '../utils/formatters';

/**
 * Computes a running balance map: transaction.id -> balance after that transaction.
 * Transactions should be sorted oldest-first (ascending by date).
 * For expenses and outgoing transfers, the balance decreases.
 * For income and incoming transfers, the balance increases.
 */
export function calculateRunningBalances(
  transactions: Transaction[],
  startBalance: number
): Map<number, number> {
  const map = new Map<number, number>();
  let balance = startBalance;

  for (const tx of transactions) {
    if (tx.type === 'income') {
      balance += tx.amount;
    } else if (tx.type === 'expense') {
      balance -= tx.amount;
    }
    // transfers are internal moves — net zero effect on total balance
    map.set(tx.id, balance);
  }

  return map;
}

interface RunningBalanceProps {
  balance: number;
}

export default function RunningBalance({ balance }: RunningBalanceProps) {
  const isPositive = balance >= 0;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
        isPositive
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      }`}
    >
      {formatCurrency(balance)}
    </span>
  );
}
