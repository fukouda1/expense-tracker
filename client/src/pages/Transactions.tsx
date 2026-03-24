import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useDisplay } from '../contexts/DisplayContext';
import { useToast } from '../components/Toast';
import TransactionCard from '../components/TransactionCard';
import TransactionDetail from '../components/TransactionDetail';
import SwipeableCard from '../components/SwipeableCard';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import PeriodNav from '../components/PeriodNav';
import DisplayOptionsModal from '../components/DisplayOptionsModal';
import PullToRefresh from '../components/PullToRefresh';
import EmptyState from '../components/EmptyState';
import { formatCurrency } from '../utils/formatters';
import type { TransactionType, Transaction } from '../types';

export default function Transactions() {
  const navigate = useNavigate();
  const { transactions, removeTransaction, copyDayTransactions, getTransactionsByDate, refresh } = useData();
  const { viewMode, showTotal, period, getPeriodRange } = useDisplay();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [copySource, setCopySource] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState(new Date().toISOString().slice(0, 10));
  const [copying, setCopying] = useState(false);
  const [showDisplayOpts, setShowDisplayOpts] = useState(false);
  const [periodTxs, setPeriodTxs] = useState<Transaction[]>([]);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoadingPeriod(true);
      try {
        const { from, to } = getPeriodRange();
        setPeriodTxs(await getTransactionsByDate(from, to));
      } catch (err) { console.error(err); }
      finally { setLoadingPeriod(false); }
    };
    load();
  }, [period, viewMode, transactions]);

  const filtered = useMemo(() => filter === 'all' ? periodTxs : periodTxs.filter(t => t.type === filter), [periodTxs, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = t.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const periodTotals = useMemo(() => {
    const income = periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const transfer = periodTxs.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);
    return { income, expense, transfer, balance: income - expense };
  }, [periodTxs]);

  const handleDelete = (tx: Transaction) => {
    setDeleteConfirm({ id: tx.id, name: tx.category_name ?? 'transaction' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    setDeleteConfirm(null);
    await removeTransaction(id);
    showToast('Transaction deleted', 'undo', {
      onUndo: async () => { await refresh(); showToast('Data refreshed', 'info'); }
    });
  };

  const handleCopyDay = async () => {
    if (!copySource || !copyTarget) return;
    setCopying(true);
    try {
      const count = await copyDayTransactions(copySource, copyTarget);
      showToast(`Copied ${count} transaction${count !== 1 ? 's' : ''}`, 'success');
      setCopySource(null);
    } catch { showToast('Copy failed', 'error'); }
    finally { setCopying(false); }
  };

  const filterButtons = [
    { value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' },
    { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfers' },
  ] as const;

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Transactions</h1>
          <button onClick={() => setShowDisplayOpts(true)} className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">⚙️</button>
        </div>

        <PeriodNav />

        {showTotal && (
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Expense', value: periodTotals.expense, color: 'text-red-500' },
              { label: 'Income', value: periodTotals.income, color: 'text-emerald-500' },
              { label: 'Transfer', value: periodTotals.transfer, color: 'text-blue-500' },
              { label: 'Balance', value: periodTotals.balance, color: periodTotals.balance >= 0 ? 'text-emerald-600' : 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-2 border border-gray-100 dark:border-gray-700 text-center">
                <p className="text-[9px] text-gray-400 uppercase">{s.label}</p>
                <p className={`text-[11px] sm:text-xs font-bold ${s.color}`}>{formatCurrency(s.value)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {filterButtons.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === f.value ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loadingPeriod ? (
          <div className="text-center text-gray-400 py-12 text-sm">Loading...</div>
        ) : grouped.length === 0 ? (
          <EmptyState icon="📋" title="No transactions found" subtitle="Try changing the period or filter" />
        ) : (
          <div className="space-y-4">
            {grouped.map(([key, txs]) => {
              const dayIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
              const dayExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
              const dayTransfer = txs.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);
              return (
                <div key={key}>
                  <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 py-1 z-10">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {viewMode !== 'daily' && new Date(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {viewMode !== 'daily' && <span className="ml-1.5 text-gray-400">({txs.length})</span>}
                      </p>
                      <div className="flex items-center gap-2">
                        {showTotal && (
                          <span className="text-[10px] text-gray-400">
                            <span className="text-emerald-500">+{formatCurrency(dayIncome)}</span>
                            {' '}<span className="text-red-500">-{formatCurrency(dayExpense)}</span>
                            {dayTransfer > 0 && <>{' '}<span className="text-blue-500">⇄{formatCurrency(dayTransfer)}</span></>}
                          </span>
                        )}
                        <button onClick={() => { setCopySource(key); setCopyTarget(new Date().toISOString().slice(0, 10)); }}
                          className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-blue-100 hover:text-blue-600 transition-colors">📋</button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {txs.map(t => (
                      <SwipeableCard key={t.id} onSwipeLeft={() => handleDelete(t)} onSwipeRight={() => navigate(`/add?edit=${t.id}`)}>
                        <TransactionCard
                          transaction={t}
                          onClick={() => setDetailTx(t)}
                          onEdit={tx => navigate(`/add?edit=${tx.id}`)}
                          onDelete={id => handleDelete(periodTxs.find(x => x.id === id) ?? t)}
                        />
                      </SwipeableCard>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Modal open={!!copySource} onClose={() => setCopySource(null)} title="Copy Day Entries">
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Copying from</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {copySource && new Date(copySource).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Copy to date</label>
              <input type="date" value={copyTarget} onChange={e => setCopyTarget(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white" />
            </div>
            <button onClick={handleCopyDay} disabled={copying || !copyTarget || copyTarget === copySource}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium">
              {copying ? 'Copying...' : 'Copy Entries'}
            </button>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={confirmDelete}
          title="Delete Transaction"
          message={`Are you sure you want to delete this ${deleteConfirm?.name ?? 'transaction'}?`}
          confirmText="Delete"
          variant="danger"
        />

        <TransactionDetail transaction={detailTx} onClose={() => setDetailTx(null)} onEdit={tx => navigate(`/add?edit=${tx.id}`)} onDelete={id => { setDetailTx(null); handleDelete(periodTxs.find(t => t.id === id)!); }} />
        <DisplayOptionsModal open={showDisplayOpts} onClose={() => setShowDisplayOpts(false)} />
      </div>
    </PullToRefresh>
  );
}
