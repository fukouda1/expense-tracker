import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionCard from '../components/TransactionCard';
import { formatCurrency } from '../utils/formatters';
import type { Account, AccountBalance, Transaction } from '../types';

type ModalView = 'all' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const VIEW_MODES: { key: ModalView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'weekly', label: 'Week' },
  { key: 'monthly', label: 'Month' },
  { key: 'quarterly', label: 'Quarter' },
  { key: 'yearly', label: 'Year' },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function currentMonthStr() { return new Date().toISOString().slice(0, 7); }

function shiftDate(d: string, days: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekStart(d: string): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - dt.getDay());
  return dt.toISOString().slice(0, 10);
}

function getQuarterStart(d: string): string {
  const [y, m] = d.split('-').map(Number);
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qStart).padStart(2, '0')}`;
}

function getInitialPeriod(mode: ModalView): string {
  if (mode === 'weekly') return getWeekStart(todayStr());
  if (mode === 'quarterly') return getQuarterStart(currentMonthStr());
  if (mode === 'yearly') return currentMonthStr().split('-')[0];
  return currentMonthStr();
}

function computeRange(mode: ModalView, period: string): { from: string; to: string } | null {
  if (mode === 'all') return null;
  if (mode === 'weekly') {
    return { from: period, to: shiftDate(period, 6) + 'T23:59:59' };
  }
  if (mode === 'monthly') {
    const [y, m] = period.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, '0')}T23:59:59` };
  }
  if (mode === 'quarterly') {
    const endMonth = shiftMonth(period, 2);
    const [y, m] = endMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${period}-01`, to: `${endMonth}-${String(lastDay).padStart(2, '0')}T23:59:59` };
  }
  if (mode === 'yearly') {
    return { from: `${period}-01-01`, to: `${period}-12-31T23:59:59` };
  }
  return null;
}

function computeLabel(mode: ModalView, period: string): string {
  if (mode === 'all') return 'All Time';
  if (mode === 'weekly') {
    const end = shiftDate(period, 6);
    const f = new Date(period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const t = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${f} – ${t}`;
  }
  if (mode === 'monthly') {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (mode === 'quarterly') {
    const [y, m] = period.split('-').map(Number);
    const q = Math.floor((m - 1) / 3) + 1;
    return `Q${q} ${y}`;
  }
  if (mode === 'yearly') return period;
  return period;
}

export default function Accounts() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { accounts, getAccountBalances, getTransactionsByDate, removeTransaction } = useData();
  const { showToast } = useToast();

  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [accountTxs, setAccountTxs] = useState<Transaction[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  // Modal-local period filter — does NOT affect Dashboard or other pages.
  // Initialize from URL params (so the filter survives navigation to edit and back).
  const [modalView, setModalView] = useState<ModalView>(() => {
    const v = params.get('view') as ModalView | null;
    if (v && ['all', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(v)) return v;
    return 'monthly';
  });
  const [modalPeriod, setModalPeriod] = useState<string>(() => {
    const v = params.get('view') as ModalView | null;
    const p = params.get('period');
    if (p) return p;
    return getInitialPeriod(v && ['weekly', 'quarterly', 'yearly'].includes(v) ? v : 'monthly');
  });

  useEffect(() => {
    getAccountBalances().then(setBalances);
  }, []);

  // Re-open modal if returning from edit via returnTo param
  useEffect(() => {
    const returnAccId = params.get('openAccount');
    if (returnAccId) {
      const acc = accounts.find(a => a.id === Number(returnAccId));
      if (acc) handleSelectAccount(acc);
    }
  }, [accounts, params]);

  const handleSelectAccount = async (acc: Account) => {
    setSelectedAccount(acc);
    setLoadingTxs(true);
    try {
      const allTx = await getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59');
      const filtered = allTx.filter(t => t.account_id === acc.id || t.to_account_id === acc.id);
      setAccountTxs(filtered);
    } finally {
      setLoadingTxs(false);
    }
  };

  const handleSetView = (m: ModalView) => {
    setModalView(m);
    if (m !== 'all') setModalPeriod(getInitialPeriod(m));
  };

  const goPrev = () => {
    setModalPeriod(prev => {
      if (modalView === 'weekly') return shiftDate(prev, -7);
      if (modalView === 'monthly') return shiftMonth(prev, -1);
      if (modalView === 'quarterly') return shiftMonth(prev, -3);
      if (modalView === 'yearly') return String(Number(prev) - 1);
      return prev;
    });
  };

  const goNext = () => {
    setModalPeriod(prev => {
      if (modalView === 'weekly') return shiftDate(prev, 7);
      if (modalView === 'monthly') return shiftMonth(prev, 1);
      if (modalView === 'quarterly') return shiftMonth(prev, 3);
      if (modalView === 'yearly') return String(Number(prev) + 1);
      return prev;
    });
  };

  const goToday = () => {
    if (modalView !== 'all') setModalPeriod(getInitialPeriod(modalView));
  };

  const handleDeleteTx = (tx: Transaction) => {
    setDeleteConfirm({ id: tx.id, name: tx.category_name ?? 'transaction' });
  };

  const confirmDeleteTx = async () => {
    if (!deleteConfirm) return;
    await removeTransaction(deleteConfirm.id);
    setDeleteConfirm(null);
    showToast('Transaction deleted', 'success');
    // Refresh the account transactions and balances
    if (selectedAccount) {
      const allTx = await getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59');
      setAccountTxs(allTx.filter(t => t.account_id === selectedAccount.id || t.to_account_id === selectedAccount.id));
    }
    getAccountBalances().then(setBalances);
  };

  const totalBalance = balances.reduce((s, b) => s + b.balance, 0);
  const getBalance = (accId: number) => balances.find(b => b.account_id === accId)?.balance ?? 0;

  // Filter transactions by active period range (null range = show all)
  const periodTxs = useMemo(() => {
    const range = computeRange(modalView, modalPeriod);
    if (!range) return accountTxs;
    return accountTxs.filter(t => t.date >= range.from && t.date <= range.to);
  }, [accountTxs, modalView, modalPeriod]);

  const periodLabel = computeLabel(modalView, modalPeriod);

  const selectedBalance = selectedAccount ? getBalance(selectedAccount.id) : 0;
  const selectedIncome = periodTxs.filter(t => t.type === 'income' && t.account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);
  const selectedExpense = periodTxs.filter(t => t.type === 'expense' && t.account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);
  const selectedTransferOut = periodTxs.filter(t => t.type === 'transfer' && t.account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);
  const selectedTransferIn = periodTxs.filter(t => t.type === 'transfer' && t.to_account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="px-4 pt-4 space-y-3">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Accounts</h1>

      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white text-center">
        <p className="text-xs opacity-80">Total Balance</p>
        <p className="text-2xl font-bold mt-0.5">{formatCurrency(totalBalance)}</p>
      </div>

      <div className="space-y-2">
        {accounts.filter(a => a.active !== false).map(acc => {
          const balance = getBalance(acc.id);
          return (
            <button
              key={acc.id}
              onClick={() => handleSelectAccount(acc)}
              className="w-full flex items-center gap-3 p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors"
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: acc.color + '20' }}>
                {acc.icon}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{acc.name}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Tap to view transactions</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-bold ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {formatCurrency(balance)}
                </p>
              </div>
              <span className="text-gray-400 text-xs">›</span>
            </button>
          );
        })}
      </div>

      <Modal
        open={!!selectedAccount}
        onClose={() => setSelectedAccount(null)}
        title={selectedAccount ? `${selectedAccount.icon} ${selectedAccount.name}` : ''}
      >
        {selectedAccount && (
          <div className="space-y-3">
            <div className="rounded-xl p-3" style={{ backgroundColor: selectedAccount.color + '12' }}>
              <div className="text-center mb-3">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Current Balance</p>
                <p className={`text-2xl font-bold ${selectedBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {formatCurrency(selectedBalance)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Income</p>
                  <p className="text-xs font-bold text-emerald-500">{formatCurrency(selectedIncome)}</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Expense</p>
                  <p className="text-xs font-bold text-red-500">{formatCurrency(selectedExpense)}</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Transfer Out</p>
                  <p className="text-xs font-bold text-blue-500">{formatCurrency(selectedTransferOut)}</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Transfer In</p>
                  <p className="text-xs font-bold text-blue-400">{formatCurrency(selectedTransferIn)}</p>
                </div>
              </div>
            </div>

            {/* Date range filter — scoped to this modal, affects stats and tx list below */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
              {VIEW_MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => handleSetView(m.key)}
                  className={`flex-1 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                    modalView === m.key
                      ? 'bg-emerald-500 text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {modalView !== 'all' && (
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 rounded-lg px-1 py-1">
                <button onClick={goPrev} className="px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-emerald-500 text-base">‹</button>
                <button onClick={goToday} className="flex-1 text-center text-xs font-semibold text-gray-900 dark:text-white">
                  {periodLabel}
                </button>
                <button onClick={goNext} className="px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-emerald-500 text-base">›</button>
              </div>
            )}

            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                {periodTxs.length} transaction{periodTxs.length !== 1 ? 's' : ''} · {periodLabel}
              </p>
              {loadingTxs ? (
                <div className="text-center py-6">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : periodTxs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  {modalView === 'all' ? 'No transactions' : 'No transactions in this period'}
                </p>
              ) : (
                periodTxs.slice(0, 150).map(t => {
                  const returnTo = `/accounts?openAccount=${selectedAccount.id}&view=${modalView}&period=${encodeURIComponent(modalPeriod)}`;
                  return (
                    <TransactionCard
                      key={t.id}
                      transaction={t}
                      onEdit={() => navigate(`/add?edit=${t.id}&returnTo=${encodeURIComponent(returnTo)}`)}
                      onDelete={() => handleDeleteTx(t)}
                    />
                  );
                })
              )}
              {periodTxs.length > 150 && (
                <p className="text-[10px] text-gray-400 text-center py-2">
                  Showing 150 of {periodTxs.length}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDeleteTx}
        title="Delete Transaction"
        message={`Are you sure you want to delete this ${deleteConfirm?.name ?? 'transaction'}?`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
