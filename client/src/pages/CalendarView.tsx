import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import TransactionCard from '../components/TransactionCard';
import TransactionDetail from '../components/TransactionDetail';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { formatCurrency, getCurrentMonth, getDaysInMonth, getFirstDayOfMonth } from '../utils/formatters';
import type { DailySummary, Transaction } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarView() {
  const navigate = useNavigate();
  const { getDailySummaries, getTransactionsByDate, copyDayTransactions, removeTransaction } = useData();
  const { showToast } = useToast();
  const [month, setMonth] = useState(getCurrentMonth());
  const [dailyData, setDailyData] = useState<DailySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayTransactions, setDayTransactions] = useState<Transaction[]>([]);
  const [copySource, setCopySource] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState('');
  const [copying, setCopying] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    getDailySummaries(month).then(setDailyData);
  }, [month]);

  useEffect(() => {
    if (selectedDate) {
      getTransactionsByDate(selectedDate, selectedDate + 'T23:59:59').then(setDayTransactions);
    }
  }, [selectedDate]);

  const daysInMonth = getDaysInMonth(month);
  const firstDay = getFirstDayOfMonth(month);
  const dailyMap = new Map(dailyData.map(d => [d.date, d]));

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDate(null);
  };

  const monthLabel = (() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Month Nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 text-gray-500 dark:text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{monthLabel}</h1>
        <button onClick={nextMonth} className="p-2 text-gray-500 dark:text-gray-400 text-lg">&rarr;</button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        {/* Days */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${month}-${String(day).padStart(2, '0')}`;
            const summary = dailyMap.get(dateStr);
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const hasExpense = summary && summary.total_expense > 0;

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative flex flex-col items-center py-1.5 rounded-lg text-xs transition-all ${
                  isSelected
                    ? 'bg-emerald-500 text-white'
                    : isToday
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className={`font-medium ${isToday && !isSelected ? 'font-bold' : ''}`}>{day}</span>
                {hasExpense && (
                  <span className={`text-[8px] mt-0.5 font-medium ${
                    isSelected ? 'text-white/80' : 'text-red-500'
                  }`}>
                    {summary.total_expense > 999 ? `${(summary.total_expense / 1000).toFixed(1)}k` : Math.round(summary.total_expense)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Monthly Summary */}
      {dailyData.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Total Income</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
              {formatCurrency(dailyData.reduce((s, d) => s + d.total_income, 0))}
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <p className="text-xs text-red-600 dark:text-red-400">Total Expenses</p>
            <p className="text-sm font-bold text-red-700 dark:text-red-300 mt-0.5">
              {formatCurrency(dailyData.reduce((s, d) => s + d.total_expense, 0))}
            </p>
          </div>
        </div>
      )}

      {/* Day Transactions */}
      {selectedDate && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            {dayTransactions.length > 0 && (
              <button
                onClick={() => { setCopySource(selectedDate); setCopyTarget(new Date().toISOString().slice(0, 10)); }}
                className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-blue-100 hover:text-blue-600 transition-colors"
              >
                📋 Copy Day
              </button>
            )}
          </div>
          {dayTransactions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No transactions on this day</p>
          ) : (
            <div className="space-y-1.5">
              {dayTransactions.map(t => (
                <TransactionCard key={t.id} transaction={t} onClick={() => setDetailTx(t)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Copy Day Modal */}
      <Modal open={!!copySource} onClose={() => setCopySource(null)} title="Copy Day Entries">
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Copying from</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {copySource && new Date(copySource + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{dayTransactions.length} transaction(s)</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Copy to date</label>
            <input
              type="date"
              value={copyTarget}
              onChange={e => setCopyTarget(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white"
            />
          </div>
          <button
            onClick={async () => {
              if (!copySource || !copyTarget) return;
              setCopying(true);
              try {
                const count = await copyDayTransactions(copySource, copyTarget);
                showToast(`Copied ${count} transaction${count !== 1 ? 's' : ''}`, 'success');
                setCopySource(null);
                getDailySummaries(month).then(setDailyData);
              } catch { showToast('Copy failed', 'error'); }
              finally { setCopying(false); }
            }}
            disabled={copying || !copyTarget || copyTarget === copySource}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium"
          >
            {copying ? 'Copying...' : 'Copy Entries'}
          </button>
        </div>
      </Modal>

      {/* Transaction Detail Modal */}
      <TransactionDetail
        transaction={detailTx}
        onClose={() => setDetailTx(null)}
        onEdit={tx => {
          setDetailTx(null);
          navigate(`/add?edit=${tx.id}&returnTo=/calendar`);
        }}
        onDelete={id => setConfirmDeleteId(id)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This cannot be undone."
        confirmText="Delete"
        variant="danger"
        onConfirm={async () => {
          if (confirmDeleteId === null) return;
          await removeTransaction(confirmDeleteId);
          setConfirmDeleteId(null);
          setDetailTx(null);
          showToast('Transaction deleted', 'success');
          if (selectedDate) {
            getTransactionsByDate(selectedDate, selectedDate + 'T23:59:59').then(setDayTransactions);
          }
          getDailySummaries(month).then(setDailyData);
        }}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
