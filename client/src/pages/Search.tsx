import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import TransactionCard from '../components/TransactionCard';
import type { Transaction, TransactionType, TransactionFilters } from '../types';

export default function Search() {
  const navigate = useNavigate();
  const { categories, accounts, searchTransactions, removeTransaction } = useData();

  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [type, setType] = useState<TransactionType | ''>('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [results, setResults] = useState<Transaction[]>([]);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = async () => {
    const filters: TransactionFilters = {};
    if (keyword) filters.search = keyword;
    if (dateFrom && dateTo) filters.dateRange = { from: dateFrom, to: dateTo + 'T23:59:59' };
    if (categoryId) filters.categoryId = categoryId as number;
    if (accountId) filters.accountId = accountId as number;
    if (type) filters.type = type as TransactionType;
    if (amountMin) filters.amountMin = Number(amountMin);
    if (amountMax) filters.amountMax = Number(amountMax);
    const res = await searchTransactions(filters);
    setResults(res);
    setSearched(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this transaction?')) {
      await removeTransaction(id);
      setResults(prev => prev.filter(t => t.id !== id));
    }
  };

  const totalExpense = results.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const totalIncome = results.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);

  const inputClass = "w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white";

  return (
    <div className="px-4 pt-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Search & Filter</h1>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="Search notes..."
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2.5 rounded-xl border text-sm ${showFilters ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
        >
          🔧
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="space-y-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">All</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">All</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Type</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className={inputClass}>
                <option value="">All</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Min ₱</label>
              <input type="number" value={amountMin} onChange={e => setAmountMin(e.target.value)} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Max ₱</label>
              <input type="number" value={amountMax} onChange={e => setAmountMax(e.target.value)} placeholder="∞" className={inputClass} />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleSearch}
        className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium"
      >
        Search
      </button>

      {/* Results */}
      {searched && (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            <div className="flex gap-3">
              <span className="text-emerald-500">Income: +₱{totalIncome.toLocaleString()}</span>
              <span className="text-red-500">Expense: -₱{totalExpense.toLocaleString()}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {results.map(t => (
              <TransactionCard
                key={t.id}
                transaction={t}
                onEdit={tx => navigate(`/add?edit=${tx.id}`)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
