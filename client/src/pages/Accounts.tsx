import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionCard from '../components/TransactionCard';
import { formatCurrency } from '../utils/formatters';
import type { Account, AccountBalance, Transaction } from '../types';

export default function Accounts() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { accounts, getAccountBalances, getTransactionsByDate, removeTransaction, refresh } = useData();
  const { showToast } = useToast();

  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [accountTxs, setAccountTxs] = useState<Transaction[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

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

  const selectedBalance = selectedAccount ? getBalance(selectedAccount.id) : 0;
  const selectedIncome = accountTxs.filter(t => t.type === 'income' && t.account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);
  const selectedExpense = accountTxs.filter(t => t.type === 'expense' && t.account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);
  const selectedTransferOut = accountTxs.filter(t => t.type === 'transfer' && t.account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);
  const selectedTransferIn = accountTxs.filter(t => t.type === 'transfer' && t.to_account_id === selectedAccount?.id).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="px-4 pt-4 space-y-3">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Accounts</h1>

      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white text-center">
        <p className="text-xs opacity-80">Total Balance</p>
        <p className="text-2xl font-bold mt-0.5">{formatCurrency(totalBalance)}</p>
      </div>

      <div className="space-y-2">
        {accounts.map(acc => {
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

            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                {accountTxs.length} transaction{accountTxs.length !== 1 ? 's' : ''}
              </p>
              {loadingTxs ? (
                <div className="text-center py-6">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : accountTxs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No transactions</p>
              ) : (
                accountTxs.slice(0, 150).map(t => (
                  <TransactionCard
                    key={t.id}
                    transaction={t}
                    onEdit={() => navigate(`/add?edit=${t.id}&returnTo=/accounts?openAccount=${selectedAccount.id}`)}
                    onDelete={() => handleDeleteTx(t)}
                  />
                ))
              )}
              {accountTxs.length > 150 && (
                <p className="text-[10px] text-gray-400 text-center py-2">
                  Showing 150 of {accountTxs.length}
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
