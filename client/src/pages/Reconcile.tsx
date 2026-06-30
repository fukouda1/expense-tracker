import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AmountInput from '../components/AmountInput';
import { formatCurrency, formatDate } from '../utils/formatters';
import type { Transaction, Account, AccountBalance, Category } from '../types';

const BAL_IN = 'Balancing - Income';   // tracked balance was too low
const BAL_OUT = 'Balancing - Expense'; // tracked balance was too high

const inputClass = 'w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white';
const todayStr = () => new Date().toISOString().slice(0, 10);

// "Settled" balancing entries — the user accepts them as-is and doesn't want to itemize.
// Keyed by a STABLE composite (date|amount|type|account) — not transaction id — so the
// settled state survives export/import (transaction ids are reassigned on re-import).
const SETTLED_KEY = 'tracecash_settled_balancing';
function balKey(t: Transaction): string {
  return `${t.date}|${t.amount}|${t.type}|${t.account_name ?? ''}`;
}
function loadSettled(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SETTLED_KEY) || '[]')); } catch { return new Set(); }
}
function saveSettled(s: Set<string>) {
  localStorage.setItem(SETTLED_KEY, JSON.stringify([...s]));
}

export default function Reconcile() {
  const navigate = useNavigate();
  const {
    accounts, categories, getAccountBalances, getBalancingTransactions,
    addTransaction, editTransaction, removeTransaction, addCategory,
  } = useData();
  const { showToast } = useToast();

  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [balTxs, setBalTxs] = useState<Transaction[]>([]);
  const [settled, setSettled] = useState<Set<string>>(loadSettled);
  const [showSettled, setShowSettled] = useState(false);

  const settle = (t: Transaction) => {
    setSettled(prev => { const n = new Set(prev); n.add(balKey(t)); saveSettled(n); return n; });
    showToast('Marked as settled', 'success');
  };
  const restore = (t: Transaction) => {
    setSettled(prev => { const n = new Set(prev); n.delete(balKey(t)); saveSettled(n); return n; });
  };

  const activeBalTxs = balTxs.filter(t => !settled.has(balKey(t)));
  const settledBalTxs = balTxs.filter(t => settled.has(balKey(t)));

  const activeAccounts = accounts.filter(a => a.active !== false);
  const balInCat = categories.find(c => c.name === BAL_IN);
  const balOutCat = categories.find(c => c.name === BAL_OUT);

  const reload = useCallback(() => {
    getAccountBalances().then(setBalances).catch(() => {});
    getBalancingTransactions().then(setBalTxs).catch(() => {});
  }, [getAccountBalances, getBalancingTransactions]);
  useEffect(() => { reload(); }, [reload]);

  // Ensure the two balancing categories exist (fresh installs won't have them).
  const [ensuring, setEnsuring] = useState(false);
  useEffect(() => {
    if (categories.length === 0 || ensuring) return;
    const missing: Array<[string, string, string, string]> = [];
    if (!categories.some(c => c.name === BAL_IN)) missing.push([BAL_IN, '⚖️', '#10b981', 'income']);
    if (!categories.some(c => c.name === BAL_OUT)) missing.push([BAL_OUT, '⚖️', '#ef4444', 'expense']);
    if (missing.length === 0) return;
    setEnsuring(true);
    (async () => {
      try { for (const [n, i, c, t] of missing) await addCategory(n, i, c, t); }
      catch { /* ignore — retry next mount */ }
      finally { setEnsuring(false); }
    })();
  }, [categories, ensuring, addCategory]);

  const balanceOf = (accId: number) => balances.find(b => b.account_id === accId)?.balance ?? 0;

  // ── Reconcile modal ──
  const [recAccount, setRecAccount] = useState<Account | null>(null);
  const [actualBal, setActualBal] = useState('');
  const [recDate, setRecDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  const openReconcile = (acc: Account) => {
    setRecAccount(acc);
    setActualBal('');
    setRecDate(todayStr());
  };

  const recTracked = recAccount ? balanceOf(recAccount.id) : 0;
  const recDiff = actualBal === '' ? 0 : Math.round((parseFloat(actualBal) - recTracked) * 100) / 100;

  const saveReconcile = async () => {
    if (!recAccount || actualBal === '' || isNaN(parseFloat(actualBal))) {
      showToast('Enter the actual balance', 'error'); return;
    }
    if (recDiff === 0) { showToast('Already balanced — no adjustment needed', 'info'); setRecAccount(null); return; }
    const cat = recDiff > 0 ? balInCat : balOutCat;
    if (!cat) { showToast('Balancing categories missing — reopen this page', 'error'); return; }
    setSaving(true);
    try {
      await addTransaction({
        amount: Math.abs(recDiff),
        type: recDiff > 0 ? 'income' : 'expense',
        category_id: cat.id,
        account_id: recAccount.id,
        to_account_id: null,
        date: `${recDate}T${new Date().toTimeString().slice(0, 5)}`,
        notes: `Reconciled ${recDate} — unidentified`,
      } as Omit<Transaction, 'id' | 'created_at'>, []);
      showToast(`Adjusted ${recAccount.name} by ${recDiff > 0 ? '+' : '-'}${formatCurrency(Math.abs(recDiff))}`, 'success');
      setRecAccount(null);
      reload();
    } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to reconcile', 'error'); }
    finally { setSaving(false); }
  };

  // ── Itemize modal ──
  const [itemizeTx, setItemizeTx] = useState<Transaction | null>(null);
  const [itemAmount, setItemAmount] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState<number | ''>('');
  const [itemNotes, setItemNotes] = useState('');
  const [itemDate, setItemDate] = useState(todayStr());

  const openItemize = (tx: Transaction) => {
    setItemizeTx(tx);
    setItemAmount('');
    setItemCategoryId('');
    setItemNotes('');
    setItemDate(tx.date.slice(0, 10));
  };

  // Categories selectable for the carved piece — match the balancing entry's type, exclude balancing cats.
  const itemizeCategories = useMemo(() => {
    if (!itemizeTx) return [];
    return categories.filter(c =>
      c.active !== false
      && c.name !== BAL_IN && c.name !== BAL_OUT
      && !c.name.startsWith('_') && c.icon !== '??' && c.icon !== '?'
      && (c.type === itemizeTx.type || c.type === 'both'),
    );
  }, [categories, itemizeTx]);

  const saveItemize = async () => {
    if (!itemizeTx) return;
    const piece = parseFloat(itemAmount);
    if (!piece || piece <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (piece > itemizeTx.amount + 0.001) { showToast(`Amount can't exceed ${formatCurrency(itemizeTx.amount)}`, 'error'); return; }
    if (itemCategoryId === '') { showToast('Pick a category for the piece', 'error'); return; }
    setSaving(true);
    try {
      const full = Math.abs(piece - itemizeTx.amount) < 0.001;
      // Keep the original time-of-day, just swap the date the user picked.
      const pieceDate = `${itemDate}T${itemizeTx.date.slice(11, 16) || '12:00'}`;
      if (full) {
        // Whole entry is the remembered transaction — recategorize it and apply the date.
        await editTransaction({
          ...itemizeTx,
          category_id: itemCategoryId as number,
          date: pieceDate,
          notes: itemNotes.trim(),
        }, []);
      } else {
        // Carve the piece out: shrink the balancing entry, create a real transaction for the piece.
        await editTransaction({ ...itemizeTx, amount: Math.round((itemizeTx.amount - piece) * 100) / 100 }, []);
        await addTransaction({
          amount: piece,
          type: itemizeTx.type,
          category_id: itemCategoryId as number,
          account_id: itemizeTx.account_id,
          to_account_id: null,
          date: pieceDate,
          notes: itemNotes.trim(),
        } as Omit<Transaction, 'id' | 'created_at'>, []);
      }
      showToast('Itemized', 'success');
      setItemizeTx(null);
      reload();
    } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to itemize', 'error'); }
    finally { setSaving(false); }
  };

  // ── Delete a balancing entry ──
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const confirmDelete = async () => {
    if (!deleteTx) return;
    const id = deleteTx.id;
    setDeleteTx(null);
    try { await removeTransaction(id); showToast('Entry deleted', 'success'); reload(); }
    catch { showToast('Failed to delete', 'error'); }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900 px-4 pt-4 space-y-4 safe-top pb-safe">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Reconcile</h1>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Forgot to record something? Set an account's actual balance — a balancing entry covers the gap.
        Remember an item later? Itemize it out of the balancing entry so nothing double-counts.
      </p>

      {/* Reconcile an account */}
      <div>
        <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Accounts</h2>
        <div className="space-y-2">
          {activeAccounts.map(acc => (
            <div key={acc.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: acc.color + '20' }}>
                {acc.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{acc.name}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Tracked: {formatCurrency(balanceOf(acc.id))}</p>
              </div>
              <button onClick={() => openReconcile(acc)}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-medium">
                ⚖️ Reconcile
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Unidentified balancing entries */}
      <div>
        <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
          Unidentified Balancing ({activeBalTxs.length})
        </h2>
        {activeBalTxs.length === 0 ? (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 py-2">
            {balTxs.length === 0
              ? 'No balancing entries — your accounts are fully itemized. 🎉'
              : 'All balancing entries are itemized or settled. 🎉'}
          </p>
        ) : (
          <div className="space-y-2">
            {activeBalTxs.map(t => {
              const isExpense = t.type === 'expense';
              return (
                <div key={t.id} className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isExpense ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(t.amount)} <span className="text-[10px] font-normal text-gray-400">{isExpense ? 'expense' : 'income'}</span>
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {t.account_name} · {formatDate(t.date)}
                      </p>
                    </div>
                    <button onClick={() => openItemize(t)}
                      className="px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[11px] font-medium flex-shrink-0">
                      Itemize
                    </button>
                    <button onClick={() => settle(t)}
                      className="px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-gray-600 dark:text-gray-300 hover:text-emerald-600 rounded-lg text-[11px] font-medium flex-shrink-0"
                      title="Accept this entry as-is — stop flagging it for itemizing">
                      ✓ Settle
                    </button>
                    <button onClick={() => setDeleteTx(t)}
                      className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Settled entries — accepted as-is, hidden from the active list */}
        {settledBalTxs.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowSettled(s => !s)}
              className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              {showSettled ? '▾' : '▸'} Settled ({settledBalTxs.length})
            </button>
            {showSettled && (
              <div className="space-y-2 mt-2">
                {settledBalTxs.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 opacity-70">
                    <span className="flex-1 min-w-0 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {formatCurrency(t.amount)} {t.type} · {t.account_name} · {formatDate(t.date)}
                    </span>
                    <button onClick={() => restore(t)}
                      className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-lg text-[10px] font-medium flex-shrink-0">
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reconcile modal */}
      <Modal open={!!recAccount} onClose={() => setRecAccount(null)} title={recAccount ? `Reconcile ${recAccount.name}` : ''}>
        {recAccount && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Tracked Balance</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(recTracked)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Actual balance (count your real money)</label>
              <AmountInput value={actualBal} onChange={setActualBal}
                placeholder="0.00" className={inputClass} autoFocus />
            </div>
            {actualBal !== '' && !isNaN(parseFloat(actualBal)) && (
              <div className={`rounded-xl p-2.5 text-center text-sm font-medium ${
                recDiff === 0 ? 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  : recDiff > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              }`}>
                {recDiff === 0 ? 'Already balanced'
                  : `Adjustment: ${recDiff > 0 ? '+' : '-'}${formatCurrency(Math.abs(recDiff))} `
                    + `(${recDiff > 0 ? 'Balancing - Income' : 'Balancing - Expense'})`}
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date</label>
              <input type="date" value={recDate} onChange={e => setRecDate(e.target.value)} className={inputClass} />
            </div>
            <button onClick={saveReconcile} disabled={saving}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
              {saving ? 'Saving...' : 'Record Adjustment'}
            </button>
          </div>
        )}
      </Modal>

      {/* Itemize modal */}
      <Modal open={!!itemizeTx} onClose={() => setItemizeTx(null)} title="Itemize Balancing Entry">
        {itemizeTx && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Remaining in this entry</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(itemizeTx.amount)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{itemizeTx.account_name} · {itemizeTx.type}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Amount you remembered</label>
              <AmountInput value={itemAmount} onChange={setItemAmount}
                placeholder={`Up to ${formatCurrency(itemizeTx.amount)}`} className={inputClass} autoFocus />
              <div className="flex gap-1.5 mt-1.5">
                {[0.25, 0.5, 1].map(f => (
                  <button key={f} type="button"
                    onClick={() => setItemAmount(String(Math.round(itemizeTx.amount * f * 100) / 100))}
                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-[10px] text-gray-600 dark:text-gray-300">
                    {f === 1 ? 'All' : `${f * 100}%`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Real category for this piece</label>
              <select value={itemCategoryId} onChange={e => setItemCategoryId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select category...</option>
                {itemizeCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date it actually happened</label>
              <input type="date" value={itemDate} onChange={e => setItemDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes (optional)</label>
              <input value={itemNotes} onChange={e => setItemNotes(e.target.value)}
                placeholder="e.g. grocery run I forgot" className={inputClass} />
            </div>
            <p className="text-[10px] text-gray-400">
              The piece becomes a real transaction; the rest stays as a balancing entry. Your account balance doesn't change.
            </p>
            <button onClick={saveItemize} disabled={saving}
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
              {saving ? 'Saving...' : 'Itemize'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTx}
        onClose={() => setDeleteTx(null)}
        onConfirm={confirmDelete}
        title="Delete Balancing Entry"
        message="Delete this balancing entry? Your account balance will shift by its amount."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
