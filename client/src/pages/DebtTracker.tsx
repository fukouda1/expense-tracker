import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, formatDate } from '../utils/formatters';
import type { Transaction } from '../types';

export default function DebtTracker() {
  const navigate = useNavigate();
  const { categories, accounts, addTransaction, getTransactionsByDate } = useData();
  const { showToast } = useToast();

  // Load ALL transactions (not period-filtered) for complete debt picture
  const [allTx, setAllTx] = useState<Transaction[]>([]);
  useEffect(() => {
    getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59').then(setAllTx);
  }, []);

  const [tab, setTab] = useState<'owe' | 'owed'>('owed');
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);

  // Record payment modal state
  const [paymentModal, setPaymentModal] = useState<{
    person: string;
    balance: number;
    mode: 'full' | 'partial';
    type: 'owed' | 'owe'; // owed = they pay you back (Lent Payment/income), owe = you pay them (Debt Payment/expense)
  } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState<number>(accounts[0]?.id ?? 1);
  const [saving, setSaving] = useState(false);

  // Mark full as paid confirm
  const [markPaidConfirm, setMarkPaidConfirm] = useState<{
    person: string;
    balance: number;
    type: 'owed' | 'owe';
  } | null>(null);

  // Mark as paid WITHOUT recording entry (just a local dismissal stored in localStorage)
  const [dismissedDebts, setDismissedDebts] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('tracecash_dismissed_debts');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const dismissDebt = (person: string, type: 'owed' | 'owe') => {
    const key = `${type}:${person}`;
    const next = new Set(dismissedDebts);
    next.add(key);
    setDismissedDebts(next);
    localStorage.setItem('tracecash_dismissed_debts', JSON.stringify([...next]));
    showToast(`Marked ${person} as settled (no entry recorded)`, 'success');
  };

  const undismissDebt = (person: string, type: 'owed' | 'owe') => {
    const key = `${type}:${person}`;
    const next = new Set(dismissedDebts);
    next.delete(key);
    setDismissedDebts(next);
    localStorage.setItem('tracecash_dismissed_debts', JSON.stringify([...next]));
  };

  const [showDismissed, setShowDismissed] = useState(false);

  const debtData = useMemo(() => {
    const lentOut = allTx.filter(t => t.category_name === 'Lent Money');
    const lentReturned = allTx.filter(t => t.category_name === 'Lent Payment');
    const debts = allTx.filter(t => t.category_name === 'Debt');
    const debtPaid = allTx.filter(t => t.category_name === 'Debt Payment');

    const peopleOwedMap = new Map<string, { lent: number; returned: number; transactions: typeof lentOut }>();
    for (const t of lentOut) {
      const person = t.notes?.trim() || 'Unknown';
      if (!peopleOwedMap.has(person)) peopleOwedMap.set(person, { lent: 0, returned: 0, transactions: [] });
      const entry = peopleOwedMap.get(person)!;
      entry.lent += t.amount;
      entry.transactions.push(t);
    }
    for (const t of lentReturned) {
      const person = t.notes?.trim() || 'Unknown';
      if (!peopleOwedMap.has(person)) peopleOwedMap.set(person, { lent: 0, returned: 0, transactions: [] });
      const entry = peopleOwedMap.get(person)!;
      entry.returned += t.amount;
      entry.transactions.push(t);
    }

    const peopleOweMap = new Map<string, { borrowed: number; paid: number; transactions: typeof debts }>();
    for (const t of debts) {
      const person = t.notes?.trim() || 'Unknown';
      if (!peopleOweMap.has(person)) peopleOweMap.set(person, { borrowed: 0, paid: 0, transactions: [] });
      const entry = peopleOweMap.get(person)!;
      entry.borrowed += t.amount;
      entry.transactions.push(t);
    }
    for (const t of debtPaid) {
      const person = t.notes?.trim() || 'Unknown';
      if (!peopleOweMap.has(person)) peopleOweMap.set(person, { borrowed: 0, paid: 0, transactions: [] });
      const entry = peopleOweMap.get(person)!;
      entry.paid += t.amount;
      entry.transactions.push(t);
    }

    const owed = Array.from(peopleOwedMap.entries())
      .map(([person, data]) => ({ person, ...data, balance: data.lent - data.returned }))
      .filter(d => d.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const owe = Array.from(peopleOweMap.entries())
      .map(([person, data]) => ({ person, ...data, balance: data.borrowed - data.paid }))
      .filter(d => d.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    // Separate dismissed
    const activeOwed = owed.filter(d => !dismissedDebts.has(`owed:${d.person}`));
    const activeOwe = owe.filter(d => !dismissedDebts.has(`owe:${d.person}`));
    const dismissedOwed = owed.filter(d => dismissedDebts.has(`owed:${d.person}`));
    const dismissedOwe = owe.filter(d => dismissedDebts.has(`owe:${d.person}`));

    return {
      owed: activeOwed, owe: activeOwe,
      dismissedOwed, dismissedOwe,
      totalOwed: activeOwed.reduce((s, d) => s + d.balance, 0),
      totalOwe: activeOwe.reduce((s, d) => s + d.balance, 0),
    };
  }, [allTx, dismissedDebts]);

  // Find category IDs for Lent Payment / Debt Payment
  const lentPaymentCatId = categories.find(c => c.name === 'Lent Payment')?.id ?? null;
  const debtPaymentCatId = categories.find(c => c.name === 'Debt Payment')?.id ?? null;

  const handleRecordPayment = async () => {
    if (!paymentModal) return;
    const amount = paymentModal.mode === 'full' ? paymentModal.balance : parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;

    setSaving(true);
    try {
      const now = new Date();
      const dateStr = `${now.toISOString().slice(0, 10)}T${now.toTimeString().slice(0, 5)}`;

      if (paymentModal.type === 'owed') {
        // They owe you → record as income (Lent Payment)
        await addTransaction({
          amount,
          type: 'income',
          category_id: lentPaymentCatId,
          account_id: paymentAccountId,
          to_account_id: null,
          date: dateStr,
          notes: paymentModal.person,
        });
      } else {
        // You owe them → record as expense (Debt Payment)
        await addTransaction({
          amount,
          type: 'expense',
          category_id: debtPaymentCatId,
          account_id: paymentAccountId,
          to_account_id: null,
          date: dateStr,
          notes: paymentModal.person,
        });
      }

      showToast(
        paymentModal.mode === 'full'
          ? `✅ Marked ${paymentModal.person} as fully paid`
          : `✅ Recorded ₱${amount.toLocaleString()} payment for ${paymentModal.person}`,
        'success'
      );
      setPaymentModal(null);
      setPaymentAmount('');
      // Reload all transactions to refresh debt data
      getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59').then(setAllTx);
    } catch (err) {
      showToast('Failed to record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkFullPaid = (person: string, balance: number, type: 'owed' | 'owe') => {
    setMarkPaidConfirm({ person, balance, type });
  };

  const confirmMarkFullPaid = () => {
    if (!markPaidConfirm) return;
    setPaymentModal({
      person: markPaidConfirm.person,
      balance: markPaidConfirm.balance,
      mode: 'full',
      type: markPaidConfirm.type,
    });
    setPaymentAccountId(accounts[0]?.id ?? 1);
    setMarkPaidConfirm(null);
  };

  const openPartialPayment = (person: string, balance: number, type: 'owed' | 'owe') => {
    setPaymentModal({ person, balance, mode: 'partial', type });
    setPaymentAmount('');
    setPaymentAccountId(accounts[0]?.id ?? 1);
  };

  const inputClass = "w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white";

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900 px-4 pt-4 pb-6 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Debt Tracker</h1>
      </div>

      {/* Summary Cards */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-500 rounded-xl p-4">
            <p className="text-[10px] text-white/80 uppercase font-semibold tracking-wider">Others Owe You</p>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(debtData.totalOwed)}</p>
            <p className="text-[10px] text-white/60 mt-0.5">{debtData.owed.length} {debtData.owed.length === 1 ? 'person' : 'people'}</p>
          </div>
          <div className="bg-red-500 rounded-xl p-4">
            <p className="text-[10px] text-white/80 uppercase font-semibold tracking-wider">You Owe Others</p>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(debtData.totalOwe)}</p>
            <p className="text-[10px] text-white/60 mt-0.5">{debtData.owe.length} {debtData.owe.length === 1 ? 'person' : 'people'}</p>
          </div>
        </div>
        {/* Net Balance */}
        {(() => {
          const net = debtData.totalOwed - debtData.totalOwe;
          const isPositive = net >= 0;
          return (
            <div className="rounded-xl p-4 text-center border-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
              style={{ borderLeftColor: isPositive ? '#10b981' : '#ef4444', borderLeftWidth: 4 }}
            >
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider">Net Balance</p>
              <p className={`text-2xl font-bold mt-1 ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPositive ? '+' : ''}{formatCurrency(net)}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                {isPositive ? 'People owe you more than you owe' : 'You owe more than people owe you'}
              </p>
            </div>
          );
        })()}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button onClick={() => setTab('owed')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${tab === 'owed' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}>
          They Owe Me ({debtData.owed.length})
        </button>
        <button onClick={() => setTab('owe')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${tab === 'owe' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}>
          I Owe ({debtData.owe.length})
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {(tab === 'owed' ? debtData.owed : debtData.owe).map(d => (
          <div key={d.person} className={`bg-white dark:bg-gray-800/80 rounded-xl border-l-4 border border-gray-200 dark:border-gray-600 overflow-hidden ${tab === 'owed' ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
            <button
              onClick={() => setExpandedPerson(expandedPerson === d.person ? null : d.person)}
              className="w-full flex items-center gap-3 p-3"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
                tab === 'owed' ? 'bg-emerald-500' : 'bg-red-500'
              }`}>
                {d.person[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{d.person}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{d.transactions.length} txn{d.transactions.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-sm font-bold ${tab === 'owed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(d.balance)}
                </span>
                <span className={`text-[10px] ${expandedPerson === d.person ? 'rotate-180' : ''} transition-transform text-gray-400`}>▼</span>
              </div>
            </button>

            {expandedPerson === d.person && (
              <div className="border-t border-gray-100 dark:border-gray-700">
                {/* Action Buttons */}
                <div className="px-3 py-2.5 space-y-1.5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleMarkFullPaid(d.person, d.balance, tab === 'owed' ? 'owed' : 'owe')}
                      className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-medium transition-colors"
                    >
                      ✅ Full ({formatCurrency(d.balance)})
                    </button>
                    <button
                      onClick={() => openPartialPayment(d.person, d.balance, tab === 'owed' ? 'owed' : 'owe')}
                      className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[11px] font-medium transition-colors"
                    >
                      💵 Partial
                    </button>
                    <button
                      onClick={() => dismissDebt(d.person, tab === 'owed' ? 'owed' : 'owe')}
                      className="py-2 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 rounded-lg text-[11px] font-medium transition-colors"
                      title="Settle without recording entry"
                    >
                      🚫
                    </button>
                  </div>
                </div>

                {/* Transaction History */}
                <div className="px-3 pb-3 space-y-1">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">History</p>
                  {d.transactions.sort((a, b) => b.date.localeCompare(a.date)).map(t => {
                    const isReturn = t.category_name === 'Lent Payment' || t.category_name === 'Debt Payment';
                    return (
                      <div key={t.id} className="flex items-center justify-between text-[11px] py-0.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isReturn ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{formatDate(t.date)}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-[10px] truncate">{t.category_name}</span>
                        </div>
                        <span className={`font-medium flex-shrink-0 ml-2 ${isReturn ? 'text-emerald-500' : 'text-red-500'}`}>
                          {isReturn ? '+' : '-'}{formatCurrency(t.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
        {(tab === 'owed' ? debtData.owed : debtData.owe).length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            {tab === 'owed' ? 'No one owes you money 🎉' : 'You don\'t owe anyone 🎉'}
          </div>
        )}
      </div>

      {/* Dismissed debts */}
      {((tab === 'owed' ? debtData.dismissedOwed : debtData.dismissedOwe).length > 0) && (
        <div>
          <button
            onClick={() => setShowDismissed(s => !s)}
            className="text-[10px] text-gray-400 flex items-center gap-1"
          >
            <span className={`transition-transform ${showDismissed ? 'rotate-90' : ''}`}>▶</span>
            {(tab === 'owed' ? debtData.dismissedOwed : debtData.dismissedOwe).length} settled (no entry)
          </button>
          {showDismissed && (
            <div className="space-y-1.5 mt-1.5">
              {(tab === 'owed' ? debtData.dismissedOwed : debtData.dismissedOwe).map(d => (
                <div key={d.person} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-xl opacity-60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs line-through text-gray-500">{d.person}</span>
                    <span className="text-[10px] text-gray-400 line-through">{formatCurrency(d.balance)}</span>
                  </div>
                  <button
                    onClick={() => undismissDebt(d.person, tab === 'owed' ? 'owed' : 'owe')}
                    className="text-[10px] text-blue-500 hover:text-blue-600"
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl p-3 border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-800">
        <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed">
          💡 <strong>How it works:</strong> The person's name is matched from the <strong>notes</strong> field of Lent Money / Debt entries.
          "✅ Full" and "💵 Partial" record a real transaction. "🚫" settles without recording (reversible).
        </p>
      </div>

      {/* Mark Full Paid Confirmation */}
      <ConfirmDialog
        open={!!markPaidConfirm}
        onClose={() => setMarkPaidConfirm(null)}
        onConfirm={confirmMarkFullPaid}
        title={markPaidConfirm?.type === 'owed' ? 'Confirm Payment Received' : 'Confirm Payment Sent'}
        message={
          markPaidConfirm ? (
            <div>
              <p>
                {markPaidConfirm.type === 'owed'
                  ? `Record that ${markPaidConfirm.person} paid you back the full amount?`
                  : `Record that you paid ${markPaidConfirm.person} the full amount?`
                }
              </p>
              <p className="text-lg font-bold mt-2">{formatCurrency(markPaidConfirm.balance)}</p>
              <p className="text-xs text-gray-400 mt-1">
                This will create a {markPaidConfirm.type === 'owed' ? 'Lent Payment (income)' : 'Debt Payment (expense)'} entry
              </p>
            </div>
          ) : ''
        }
        confirmText="Record Payment"
        variant="info"
      />

      {/* Partial Payment Modal */}
      <Modal
        open={!!paymentModal && paymentModal.mode === 'partial'}
        onClose={() => setPaymentModal(null)}
        title={paymentModal?.type === 'owed' ? `Payment from ${paymentModal?.person}` : `Payment to ${paymentModal?.person}`}
      >
        {paymentModal && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Outstanding balance</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(paymentModal.balance)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Payment Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  max={paymentModal.balance}
                  className="w-full pl-7 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-lg font-bold text-gray-900 dark:text-white"
                  autoFocus
                  inputMode="decimal"
                />
              </div>
              {/* Quick amount buttons */}
              <div className="flex gap-1.5 mt-2">
                {[0.25, 0.5, 0.75, 1].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setPaymentAmount(String(Math.round(paymentModal.balance * pct * 100) / 100))}
                    className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-[10px] text-gray-600 dark:text-gray-400 font-medium hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                  >
                    {pct === 1 ? 'Full' : `${pct * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                {paymentModal.type === 'owed' ? 'Receive to Account' : 'Pay from Account'}
              </label>
              <select
                value={paymentAccountId}
                onChange={e => setPaymentAccountId(Number(e.target.value))}
                className={inputClass}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2.5">
              <p className="text-[10px] text-blue-600 dark:text-blue-400">
                {paymentModal.type === 'owed'
                  ? '📥 This will create a "Lent Payment" income entry'
                  : '📤 This will create a "Debt Payment" expense entry'
                }
              </p>
            </div>

            <button
              onClick={handleRecordPayment}
              disabled={saving || !paymentAmount || parseFloat(paymentAmount) <= 0 || parseFloat(paymentAmount) > paymentModal.balance}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? 'Recording...' : `Record ₱${paymentAmount || '0'} Payment`}
            </button>
          </div>
        )}
      </Modal>

      {/* Full Payment Modal (just account selection) */}
      <Modal
        open={!!paymentModal && paymentModal.mode === 'full'}
        onClose={() => setPaymentModal(null)}
        title="Select Account"
      >
        {paymentModal && paymentModal.mode === 'full' && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">
                {paymentModal.type === 'owed' ? `${paymentModal.person} is paying you` : `You are paying ${paymentModal.person}`}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(paymentModal.balance)}</p>
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                {paymentModal.type === 'owed' ? 'Receive to Account' : 'Pay from Account'}
              </label>
              <div className="space-y-1.5">
                {accounts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setPaymentAccountId(a.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      paymentAccountId === a.id ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-500' : 'bg-gray-50 dark:bg-gray-700'
                    }`}
                  >
                    <span className="text-lg">{a.icon}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleRecordPayment}
              disabled={saving}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? 'Recording...' : `✅ Confirm ${paymentModal.type === 'owed' ? 'Received' : 'Paid'}`}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
