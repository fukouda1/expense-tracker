import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import TransactionCard from '../components/TransactionCard';
import TransactionDetail from '../components/TransactionDetail';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { formatCurrency } from '../utils/formatters';
import type { Transaction, TransactionType, TransactionFilters } from '../types';

const STORAGE_KEY = 'tracecash_search_state';

export default function Search() {
  const navigate = useNavigate();
  const { categories, accounts, searchTransactions, removeTransaction } = useData();
  const { showToast } = useToast();

  // Restore state from sessionStorage so edit→cancel doesn't lose results
  const saved = sessionStorage.getItem(STORAGE_KEY);
  const initial = saved ? JSON.parse(saved) : null;

  const [keyword, setKeyword] = useState(initial?.keyword ?? '');
  const [dateFrom, setDateFrom] = useState(initial?.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(initial?.dateTo ?? '');
  const [categoryId, setCategoryId] = useState<number | ''>(initial?.categoryId ?? '');
  const [accountId, setAccountId] = useState<number | ''>(initial?.accountId ?? '');
  const [type, setType] = useState<TransactionType | ''>(initial?.type ?? '');
  const [amountMin, setAmountMin] = useState(initial?.amountMin ?? '');
  const [amountMax, setAmountMax] = useState(initial?.amountMax ?? '');
  const [results, setResults] = useState<Transaction[]>(initial?.results ?? []);
  const [total, setTotal] = useState<number>(initial?.total ?? 0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(initial?.searched ?? false);
  const [showFilters, setShowFilters] = useState(false);
  const [searching, setSearching] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  // Persist search state so it survives navigation
  useEffect(() => {
    if (searched) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        keyword, dateFrom, dateTo, categoryId, accountId, type, amountMin, amountMax, results, searched,
      }));
    }
  }, [results, searched]);

  // Clear on unmount only if navigating away (not to /add)
  useEffect(() => {
    return () => {
      // Don't clear — let it persist. User can clear manually or it gets overwritten on new search.
    };
  }, []);

  const buildFilters = (): TransactionFilters => {
    const filters: TransactionFilters = {};
    if (keyword) filters.search = keyword;
    if (dateFrom && dateTo) filters.dateRange = { from: dateFrom, to: dateTo + 'T23:59:59' };
    if (categoryId) filters.categoryId = categoryId as number;
    if (accountId) filters.accountId = accountId as number;
    if (type) filters.type = type as TransactionType;
    if (amountMin) filters.amountMin = Number(amountMin);
    if (amountMax) filters.amountMax = Number(amountMax);
    return filters;
  };

  const handleSearch = async () => {
    setSearching(true);
    try {
      const res = await searchTransactions(buildFilters(), 0);
      setResults(res.results);
      setTotal(res.total);
      setHasMore(res.hasMore);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await searchTransactions(buildFilters(), results.length);
      setResults(prev => [...prev, ...res.results]);
      setTotal(res.total);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleClear = () => {
    setKeyword(''); setDateFrom(''); setDateTo(''); setCategoryId('');
    setAccountId(''); setType(''); setAmountMin(''); setAmountMax('');
    setResults([]); setSearched(false);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  const handleDelete = (tx: Transaction) => {
    setDeleteConfirm({ id: tx.id, name: tx.category_name ?? 'transaction' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    setDeleteConfirm(null);
    await removeTransaction(id);
    setResults(prev => prev.filter(t => t.id !== id));
    showToast('Transaction deleted', 'success');
  };

  const handleEdit = (tx: Transaction) => {
    navigate(`/add?edit=${tx.id}&returnTo=/search`);
  };

  const totalExpense = results.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const totalIncome = results.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const totalTransfer = results.filter(r => r.type === 'transfer').reduce((s, r) => s + r.amount, 0);

  const inputClass = "w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none";

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900 px-4 pt-4 space-y-3 safe-top pb-safe">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => { navigate('/'); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Search</h1>
        </div>
        {searched && (
          <button onClick={handleClear} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="Search by notes..."
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            autoFocus
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 rounded-xl border text-sm transition-all ${
            showFilters
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="space-y-2.5 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wider">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wider">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wider">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">All Categories</option>
                {categories.filter(c => !c.name.startsWith('_') && c.icon !== '??' && c.icon !== '?').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wider">Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">All Accounts</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wider">Type</label>
              <select value={type} onChange={e => setType(e.target.value as TransactionType | '')} className={inputClass}>
                <option value="">All</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wider">Min</label>
              <input type="number" value={amountMin} onChange={e => setAmountMin(e.target.value)} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wider">Max</label>
              <input type="number" value={amountMax} onChange={e => setAmountMax(e.target.value)} placeholder="No limit" className={inputClass} />
            </div>
          </div>
        </div>
      )}

      {/* Search Button */}
      <button
        onClick={handleSearch}
        disabled={searching}
        className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-400 text-white rounded-xl text-sm font-medium transition-colors"
      >
        {searching ? 'Searching...' : 'Search'}
      </button>

      {/* Results */}
      {searched && (
        <>
          {/* Summary bar */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-2.5 border border-gray-200 dark:border-gray-600">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {results.length}{hasMore ? ` of ${total}` : ''} result{total !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2 text-[10px] font-semibold">
              {totalIncome > 0 && <span className="text-emerald-500">+{formatCurrency(totalIncome)}</span>}
              {totalExpense > 0 && <span className="text-red-500">-{formatCurrency(totalExpense)}</span>}
              {totalTransfer > 0 && <span className="text-blue-500">{formatCurrency(totalTransfer)}</span>}
            </div>
          </div>

          {results.length === 0 ? (
            <EmptyState icon="🔍" title="No results found" subtitle="Try different keywords or filters" />
          ) : (
            <div className="space-y-1.5">
              {results.map(t => (
                <TransactionCard
                  key={t.id}
                  transaction={t}
                  onClick={() => setDetailTx(t)}
                  onEdit={() => handleEdit(t)}
                  onDelete={() => handleDelete(t)}
                />
              ))}
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-emerald-600 font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : `Load more (${total - results.length} remaining)`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {!searched && (
        <div className="pt-8">
          <EmptyState icon="🔍" title="Search your transactions" subtitle="Enter keywords or use filters to find transactions" />
        </div>
      )}

      {/* Transaction Detail Modal */}
      <TransactionDetail
        transaction={detailTx}
        onClose={() => setDetailTx(null)}
        onEdit={tx => handleEdit(tx)}
        onDelete={id => { setDetailTx(null); const tx = results.find(t => t.id === id); if (tx) handleDelete(tx); }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title="Delete Transaction"
        message={`Delete this ${deleteConfirm?.name ?? 'transaction'}?`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
