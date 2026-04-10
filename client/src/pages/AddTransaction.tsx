import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import QuickTemplateBar from '../components/QuickTemplates';
import { get } from '../services/api';
import * as repo from '../local/repository';
import { formatCurrency } from '../utils/formatters';
import CurrencyConverter from '../components/CurrencyConverter';
import SplitTransaction from '../components/SplitTransaction';
import type { Transaction, TransactionType } from '../types';

const isNative = Capacitor.isNativePlatform();

const NOTES_MAX = 300;

export default function AddTransaction() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { showToast } = useToast();
  const { categories, accounts, tags, addTransaction, editTransaction, transactions,
    addAccount, addCategory, addTag, getAccountBalances } = useData();
  const [accBalances, setAccBalances] = useState<Record<number, number>>({});

  const editId = params.get('edit') ? Number(params.get('edit')) : null;
  // Look in recently loaded transactions first; if missing, fetch async below
  const [editTx, setEditTx] = useState<Transaction | null>(() =>
    editId ? (transactions.find(t => t.id === editId) ?? null) : null
  );
  const returnTo = params.get('returnTo');

  // Pre-fill from query params (used by RecurringPreview "+ Add")
  const prefillType = params.get('type') as TransactionType | null;
  const prefillAmount = params.get('amount');
  const prefillCategoryId = params.get('categoryId');
  const prefillAccountId = params.get('accountId');
  const prefillDate = params.get('date');
  const prefillTime = params.get('time');
  const prefillNotes = params.get('notes');
  const prefillToAccountId = params.get('toAccountId');
  const recurringDismiss = params.get('recurringDismiss');

  const goBack = () => {
    if (returnTo) navigate(returnTo, { replace: true });
    else navigate(-1);
  };

  const [type, setType] = useState<TransactionType>(editTx?.type ?? prefillType ?? 'expense');
  const [display, setDisplay] = useState(editTx ? String(editTx.amount) : prefillAmount ?? '0');
  const [categoryId, setCategoryId] = useState<number | null>(editTx?.category_id ?? (prefillCategoryId ? Number(prefillCategoryId) : null));
  const [accountId, setAccountId] = useState<number>(editTx?.account_id ?? (prefillAccountId ? Number(prefillAccountId) : accounts.find(a => a.active !== false)?.id ?? accounts[0]?.id ?? 1));
  const [toAccountId, setToAccountId] = useState<number | null>(editTx?.to_account_id ?? (prefillToAccountId ? Number(prefillToAccountId) : null));
  const [date, setDate] = useState(editTx?.date?.slice(0, 10) ?? prefillDate ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(editTx?.date?.slice(11, 16) ?? prefillTime ?? new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState(editTx?.notes ?? prefillNotes ?? '');
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(() => {
    if (!editTx) return null;
    try {
      const receipts = JSON.parse(localStorage.getItem('tracecash_receipts') || '{}');
      return receipts[`${editTx.date}|${editTx.amount}|${editTx.type}`] ?? null;
    } catch { return null; }
  });
  const [showConverter, setShowConverter] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>(
    () => editTx?.tags?.map(t => t.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [freshEntry, setFreshEntry] = useState(true);

  // Pinned categories

  // Batch entry mode
  const [stayOpen, setStayOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Notes autocomplete
  const [showNoteSuggestions, setShowNoteSuggestions] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Inline create states
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [accSearch, setAccSearch] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  // If editId is set but transaction wasn't in recent cache, fetch it and pre-fill form
  useEffect(() => {
    if (!editId || editTx) return;
    const load = async () => {
      try {
        let tx: Transaction | null = null;
        if (isNative) {
          tx = await repo.getTransactionById(editId);
        } else {
          tx = await get<Transaction>(`/api/transactions/${editId}`);
        }
        if (tx) {
          setEditTx(tx);
          setType(tx.type);
          setDisplay(String(tx.amount));
          setCategoryId(tx.category_id ?? null);
          setAccountId(tx.account_id);
          setToAccountId(tx.to_account_id ?? null);
          setDate(tx.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
          setTime(tx.date?.slice(11, 16) ?? new Date().toTimeString().slice(0, 5));
          setNotes(tx.notes ?? '');
          setSelectedTags(tx.tags?.map(t => t.id) ?? []);
          try {
            const receipts = JSON.parse(localStorage.getItem('tracecash_receipts') || '{}');
            setReceiptPhoto(receipts[`${tx.date}|${tx.amount}|${tx.type}`] ?? null);
          } catch { /* ignore */ }
        }
      } catch {
        // Transaction not found — form stays in blank/prefill state
      }
    };
    load();
  }, [editId]);

  useEffect(() => {
    if (accounts.length > 0 && !editTx && !prefillAccountId) setAccountId(accounts.find(a => a.active !== false)?.id ?? accounts[0].id);
  }, [accounts]);

  const filteredCategories = categories.filter(c =>
    c.active !== false && !c.name.startsWith('_') && c.icon !== '??' && c.icon !== '?' &&
    (type === 'transfer' ? false : c.type === type || c.type === 'both')
  );
  // Use sort_order from Settings (drag-and-drop order)
  const sortedCategories = filteredCategories;

  // Unique notes for autocomplete
  const uniqueNotes = useMemo(() => {
    const noteSet = new Set<string>();
    for (const tx of transactions) {
      if (tx.notes && tx.notes.trim()) noteSet.add(tx.notes.trim());
    }
    return Array.from(noteSet);
  }, [transactions]);
  const filteredNotes = useMemo(() => {
    if (!notes.trim()) return [];
    const lower = notes.toLowerCase();
    return uniqueNotes.filter(n => n.toLowerCase().includes(lower) && n.toLowerCase() !== lower).slice(0, 6);
  }, [notes, uniqueNotes]);
  const activeAccounts = accounts.filter(a => a.active !== false);

  const selectedAccount = accounts.find(a => a.id === accountId);
  const selectedToAccount = accounts.find(a => a.id === toAccountId);
  const selectedCategory = categories.find(c => c.id === categoryId);

  // Calculator logic
  const handleDigit = useCallback((digit: string) => {
    setDisplay(prev => {
      if (freshEntry || prev === '0') {
        setFreshEntry(false);
        return digit === '.' ? '0.' : digit;
      }
      if (digit === '.' && prev.includes('.')) return prev;
      if (digit === '.' || !prev.includes('.') || prev.split('.')[1].length < 2) {
        return prev + digit;
      }
      return prev;
    });
  }, [freshEntry]);

  const handleBackspace = () => {
    setDisplay(prev => prev.length <= 1 ? '0' : prev.slice(0, -1));
  };

  const handleOperator = (op: string) => {
    const current = parseFloat(display);
    if (pendingOp && prevValue !== null) {
      const result = calculate(prevValue, current, pendingOp);
      setDisplay(String(result));
      setPrevValue(result);
    } else {
      setPrevValue(current);
    }
    setPendingOp(op);
    setFreshEntry(true);
  };

  const handleEquals = () => {
    if (pendingOp && prevValue !== null) {
      const current = parseFloat(display);
      const result = calculate(prevValue, current, pendingOp);
      setDisplay(String(result));
      setPrevValue(null);
      setPendingOp(null);
      setFreshEntry(true);
    }
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return Math.round((a + b) * 100) / 100;
      case '-': return Math.round((a - b) * 100) / 100;
      case '×': return Math.round((a * b) * 100) / 100;
      case '÷': return b !== 0 ? Math.round((a / b) * 100) / 100 : 0;
      default: return b;
    }
  };

  const handleSubmit = async () => {
    const amount = parseFloat(display);
    if (!amount || amount <= 0) {
      setAmountError(true);
      setTimeout(() => setAmountError(false), 600);
      return;
    }
    setAmountError(false);

    // Duplicate detection: check if similar transaction exists within last hour
    if (!editTx) {
      const recent = transactions.filter(t => {
        const timeDiff = Math.abs(new Date().getTime() - new Date(t.date).getTime());
        return timeDiff < 3600000 && t.amount === amount && t.type === type && t.account_id === accountId && t.category_id === categoryId;
      });
      if (recent.length > 0 && !confirm(`A similar ${type} of ${formatCurrency(amount)} was recorded in the last hour. Save anyway?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const data = {
        amount,
        type,
        category_id: type === 'transfer' ? null : categoryId,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        date: `${date}T${time}`,
        notes,
      };
      // Persist receipt photo for both create and edit, handling key changes on edit
      const persistReceipt = () => {
        try {
          const receipts = JSON.parse(localStorage.getItem('tracecash_receipts') || '{}');
          const newKey = `${data.date}|${data.amount}|${data.type}`;
          if (editTx) {
            const oldKey = `${editTx.date}|${editTx.amount}|${editTx.type}`;
            if (oldKey !== newKey) delete receipts[oldKey];
          }
          if (receiptPhoto) receipts[newKey] = receiptPhoto;
          else delete receipts[newKey];
          localStorage.setItem('tracecash_receipts', JSON.stringify(receipts));
        } catch { /* storage full */ }
      };

      if (editTx) {
        await editTransaction({ ...editTx, ...data }, selectedTags);
        persistReceipt();
        goBack();
      } else {
        await addTransaction(data as any, selectedTags);
        persistReceipt();
        // Dismiss the recurring preview item only after successful save
        if (recurringDismiss) {
          try {
            const DISMISSED_KEY = 'tracecash_recurring_dismissed';
            const dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}');
            dismissed[recurringDismiss] = Date.now();
            localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
          } catch { /* ignore */ }
        }
        if (stayOpen) {
          // Reset form but keep account and date
          setDisplay('0');
          setNotes('');
          setCategoryId(null);
          setSelectedTags([]);
          setReceiptPhoto(null);
          setFreshEntry(true);
          setPendingOp(null);
          setPrevValue(null);
          setToast('Saved! Ready for next entry.');
          setTimeout(() => setToast(null), 2500);
        } else {
          goBack();
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to save transaction';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const typeColor = type === 'income' ? 'text-emerald-400' : type === 'transfer' ? 'text-blue-400' : 'text-red-400';
  const isFutureDate = date > new Date().toISOString().slice(0, 10);

  const handleTypeChange = (newType: TransactionType) => {
    if (newType !== type && categoryId !== null) {
      showToast('Category cleared — types do not match', 'info');
      setCategoryId(null);
    }
    setType(newType);
  };

  const keypad = [
    { label: '+', action: () => handleOperator('+'), op: true },
    { label: '7', action: () => handleDigit('7') },
    { label: '8', action: () => handleDigit('8') },
    { label: '9', action: () => handleDigit('9') },
    { label: '-', action: () => handleOperator('-'), op: true },
    { label: '4', action: () => handleDigit('4') },
    { label: '5', action: () => handleDigit('5') },
    { label: '6', action: () => handleDigit('6') },
    { label: '×', action: () => handleOperator('×'), op: true },
    { label: '1', action: () => handleDigit('1') },
    { label: '2', action: () => handleDigit('2') },
    { label: '3', action: () => handleDigit('3') },
    { label: '÷', action: () => handleOperator('÷'), op: true },
    { label: '0', action: () => handleDigit('0') },
    { label: '.', action: () => handleDigit('.') },
    { label: '=', action: handleEquals, eq: true },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-900 safe-top">
      {/* === TOP SECTION (scrollable if needed) === */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 sm:py-3">
          <button onClick={goBack} className="text-red-400 font-medium text-xs sm:text-sm flex items-center gap-1">
            ✕ CANCEL
          </button>
          <div className="flex items-center gap-3">
            {!editTx && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setDisplay('0'); setNotes(''); setSelectedTags([]); setCategoryId(null); setFreshEntry(true); setPendingOp(null); setPrevValue(null); }}
                  className="text-[10px] sm:text-xs text-gray-400 hover:text-amber-400 transition-colors"
                >
                  Clear
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stayOpen}
                    onChange={e => setStayOpen(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-emerald-500"
                  />
                  <span className="text-[10px] sm:text-xs text-gray-400">Stay open</span>
                </label>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving || parseFloat(display) <= 0}
              className="text-emerald-400 font-medium text-xs sm:text-sm flex items-center gap-1 disabled:opacity-40"
            >
              ✓ SAVE
            </button>
          </div>
        </div>

        {/* Type Selector */}
        <div className="flex items-center justify-center px-4 py-1 sm:py-2">
          {(['income', 'expense', 'transfer'] as const).map((t, i) => (
            <div key={t} className="flex items-center">
              {i > 0 && <span className="text-gray-600 mx-2 sm:mx-3">|</span>}
              <button
                onClick={() => handleTypeChange(t)}
                className={`text-[11px] sm:text-sm font-semibold uppercase tracking-wide flex items-center gap-1 transition-colors ${
                  type === t ? typeColor : 'text-gray-500'
                }`}
              >
                {type === t && <span className="text-sm sm:text-lg">✓</span>}
                {t === 'income' ? 'INCOME' : t === 'expense' ? 'EXPENSE' : 'TRANSFER'}
              </button>
            </div>
          ))}
        </div>

        {/* Account & Category Row */}
        <div className="flex gap-2 px-3 sm:px-4 py-1 sm:py-2">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] sm:text-[10px] text-gray-500 text-center mb-0.5 sm:mb-1 uppercase tracking-wider">Account</p>
            <button
              onClick={async () => {
                setShowAccountPicker(true);
                try {
                  const bals = await getAccountBalances();
                  const map: Record<number, number> = {};
                  for (const b of bals) map[b.account_id] = b.balance;
                  setAccBalances(map);
                } catch { /* ignore */ }
              }}
              className="w-full py-2 sm:py-2.5 px-2 sm:px-3 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-gray-200 flex items-center justify-center gap-1.5 sm:gap-2"
            >
              <span className="text-sm sm:text-base">{selectedAccount?.icon ?? '💰'}</span>
              <span className="truncate">{selectedAccount?.name ?? 'Account'}</span>
            </button>
          </div>
          {type === 'transfer' ? (
            <div className="flex-1 min-w-0">
              <p className="text-[9px] sm:text-[10px] text-gray-500 text-center mb-0.5 sm:mb-1 uppercase tracking-wider">To Account</p>
              <button
                onClick={() => setShowToAccountPicker(true)}
                className="w-full py-2 sm:py-2.5 px-2 sm:px-3 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-gray-200 flex items-center justify-center gap-1.5 sm:gap-2"
              >
                <span className="text-sm sm:text-base">{selectedToAccount?.icon ?? '🏦'}</span>
                <span className="truncate">{selectedToAccount?.name ?? 'Select'}</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-[9px] sm:text-[10px] text-gray-500 text-center mb-0.5 sm:mb-1 uppercase tracking-wider">Category</p>
              <button
                onClick={() => setShowCategoryPicker(true)}
                className="w-full py-2 sm:py-2.5 px-2 sm:px-3 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-gray-200 flex items-center justify-center gap-1.5 sm:gap-2"
              >
                <span className="text-sm sm:text-base">{selectedCategory?.icon ?? '🏷️'}</span>
                <span className="truncate">{selectedCategory?.name ?? 'Category'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Templates — applies all entries at once */}
        {!editTx && <div className="px-3 sm:px-4"><QuickTemplateBar onApplied={goBack} /></div>}

        {/* Notes with autocomplete */}
        <div className="px-3 sm:px-4 py-1 relative">
          <textarea
            ref={notesRef}
            value={notes}
            onChange={e => { if (e.target.value.length <= NOTES_MAX) { setNotes(e.target.value); setShowNoteSuggestions(true); } }}
            onFocus={() => setShowNoteSuggestions(true)}
            onBlur={() => setTimeout(() => setShowNoteSuggestions(false), 150)}
            placeholder="Add notes"
            rows={5}
            maxLength={NOTES_MAX}
            className="w-full p-2 sm:p-3 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-gray-200 placeholder-gray-500 resize-none"
          />
          {notes.length > NOTES_MAX * 0.85 && (
            <span className="absolute bottom-2 right-5 text-[9px] text-amber-400">{NOTES_MAX - notes.length} left</span>
          )}
          {showNoteSuggestions && filteredNotes.length > 0 && (
            <div className="absolute left-3 right-3 sm:left-4 sm:right-4 top-full -mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-40 max-h-36 overflow-y-auto">
              {filteredNotes.map((n, i) => (
                <button
                  key={i}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setNotes(n); setShowNoteSuggestions(false); }}
                  className="w-full text-left px-3 py-2 text-xs sm:text-sm text-gray-300 hover:bg-gray-700 truncate border-b border-gray-700 last:border-b-0"
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Receipt photo + Split */}
        <div className="px-3 sm:px-4 py-0.5 flex items-center gap-2">
          {!editTx && type !== 'transfer' && parseFloat(display) > 0 && (
            <button onClick={() => setShowSplit(true)}
              className="text-[10px] px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors">
              ✂️ Split
            </button>
          )}
          <button
            onClick={async () => {
              try {
                const photo = await Camera.getPhoto({
                  quality: 70,
                  allowEditing: false,
                  resultType: CameraResultType.Base64,
                  source: CameraSource.Prompt,
                  width: 800,
                });
                if (photo.base64String) setReceiptPhoto(`data:image/${photo.format};base64,${photo.base64String}`);
              } catch { /* user cancelled */ }
            }}
            className="text-[10px] px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            📷 {receiptPhoto ? 'Change Receipt' : 'Attach Receipt'}
          </button>
          {receiptPhoto && (
            <>
              <img src={receiptPhoto} alt="Receipt" className="w-8 h-8 rounded object-cover border border-gray-600 cursor-pointer" onClick={() => setShowReceiptPreview(true)} />
              <button onClick={() => setReceiptPhoto(null)} className="text-[10px] text-red-400">✕</button>
            </>
          )}
        </div>

        {/* Tags row */}
        <div className="px-3 sm:px-4 py-0.5 sm:py-1 flex gap-1.5 overflow-x-auto">
          {tags.filter(t => t.active !== false && (t.category_id === null || t.category_id === categoryId)).map(tag => (
            <button
              key={tag.id}
              onClick={() => setSelectedTags(prev => prev.includes(tag.id) ? prev.filter(t => t !== tag.id) : [...prev, tag.id])}
              className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                selectedTags.includes(tag.id)
                  ? 'text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
              style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color } : undefined}
            >
              {tag.name}
            </button>
          ))}
          {/* Inline add tag */}
          {showNewTag ? (
            <div className="flex gap-1 flex-shrink-0">
              <input
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                placeholder="Tag name"
                className="w-20 px-2 py-0.5 bg-gray-800 border border-gray-600 rounded-full text-[10px] text-gray-200 outline-none"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTagName.trim()) {
                    if (tags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase())) {
                      showToast(`Tag "${newTagName.trim()}" already exists`, 'error');
                      return;
                    }
                    addTag(newTagName.trim(), '#3b82f6');
                    setNewTagName(''); setShowNewTag(false);
                  }
                  if (e.key === 'Escape') setShowNewTag(false);
                }}
              />
              <button
                onClick={() => { if (newTagName.trim()) { if (tags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase())) { showToast(`Tag "${newTagName.trim()}" already exists`, 'error'); return; } addTag(newTagName.trim(), '#3b82f6'); setNewTagName(''); setShowNewTag(false); } }}
                className="px-2 py-0.5 bg-emerald-500 text-white rounded-full text-[9px] font-medium"
              >✓</button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewTag(true)}
              className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-medium whitespace-nowrap flex-shrink-0 border border-dashed border-gray-600 text-gray-500 hover:border-emerald-500 hover:text-emerald-400 transition-colors"
            >
              + Tag
            </button>
          )}
        </div>
      </div>

      {/* === BOTTOM SECTION (always pinned) === */}
      <div className="flex-shrink-0">
        {/* Calculator Display */}
        <div className={`px-3 sm:px-4 py-2 sm:py-3 bg-gray-800 mx-3 sm:mx-4 rounded-xl flex items-center justify-end gap-2 sm:gap-3 transition-all ${amountError ? 'ring-2 ring-red-500 animate-pulse' : ''}`}>
          <div className="flex flex-col items-end flex-1 min-w-0">
            <span className={`text-3xl sm:text-5xl font-light ${amountError ? 'text-red-400' : typeColor} tracking-tight truncate`}>
              {display === '0' ? '0' : display}
            </span>
            {amountError && (
              <span className="text-red-400 text-[10px] mt-0.5">Enter an amount greater than 0</span>
            )}
            {pendingOp && !amountError && (
              <span className="text-gray-500 text-[10px] mt-0.5">Pending: {pendingOp}</span>
            )}
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button onClick={handleBackspace} className="text-gray-400 text-lg sm:text-xl p-1">⌫</button>
            <button onClick={() => setShowConverter(true)} className="text-gray-500 text-[9px] p-1 hover:text-emerald-400">💱</button>
          </div>
        </div>

        {/* Calculator Keypad */}
        <div className="grid grid-cols-4 gap-[1px] bg-gray-700 mx-3 sm:mx-4 my-1.5 sm:my-2 rounded-xl overflow-hidden">
          {keypad.map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              className={`py-3 sm:py-4 font-semibold text-base sm:text-xl active:opacity-70 transition-opacity ${
                btn.eq
                  ? 'bg-amber-700 text-white'
                  : btn.op
                  ? 'bg-gray-600 text-amber-400'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Date & Time Row */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 px-4 py-1.5 sm:py-2 pb-2 sm:pb-4 safe-bottom">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={`bg-transparent text-xs sm:text-sm border-none outline-none ${isFutureDate ? 'text-amber-400' : 'text-gray-300'}`}
            />
            {isFutureDate && <span className="text-amber-400 text-[10px]">⚠ future</span>}
          </div>
          <span className="text-gray-600">|</span>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="bg-transparent text-gray-300 text-xs sm:text-sm border-none outline-none"
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg z-50 animate-bounce">
          {toast}
        </div>
      )}

      {/* Account Picker Modal */}
      <Modal open={showAccountPicker} onClose={() => { setShowAccountPicker(false); setShowNewAccount(false); setAccSearch(''); }} title="Select Account">
        <div className="space-y-1.5">
          <input
            value={accSearch}
            onChange={e => setAccSearch(e.target.value)}
            onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
            placeholder="Search accounts..."
            className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
          />
          {activeAccounts.filter(a => !accSearch || a.name.toLowerCase().includes(accSearch.toLowerCase())).map(a => (
            <button
              key={a.id}
              onClick={() => { setAccountId(a.id); setShowAccountPicker(false); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                accountId === a.id ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-500' : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-lg">{a.icon}</span>
              <div className="flex-1 min-w-0 text-left">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</span>
                {accBalances[a.id] !== undefined && (
                  <p className={`text-[10px] ${accBalances[a.id] >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    Balance: {formatCurrency(accBalances[a.id])}
                  </p>
                )}
              </div>
            </button>
          ))}
          {/* Inline add account */}
          {showNewAccount ? (
            <div className="flex gap-2 mt-2">
              <input
                value={newAccName}
                onChange={e => setNewAccName(e.target.value)}
                placeholder="Account name"
                className="flex-1 p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && newAccName.trim()) {
                    if (accounts.some(a => a.name.toLowerCase() === newAccName.trim().toLowerCase())) {
                      showToast(`Account "${newAccName.trim()}" already exists`, 'error');
                      return;
                    }
                    addAccount(newAccName.trim(), '💰', '#10b981', 0);
                    setNewAccName(''); setShowNewAccount(false);
                  }
                }}
              />
              <button
                onClick={() => { if (newAccName.trim()) { if (accounts.some(a => a.name.toLowerCase() === newAccName.trim().toLowerCase())) { showToast(`Account "${newAccName.trim()}" already exists`, 'error'); return; } addAccount(newAccName.trim(), '💰', '#10b981', 0); setNewAccName(''); setShowNewAccount(false); } }}
                className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium"
              >Add</button>
            </div>
          ) : (
            <button onClick={() => setShowNewAccount(true)} className="w-full p-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 text-sm hover:border-emerald-500 hover:text-emerald-500 transition-colors">
              + New Account
            </button>
          )}
        </div>
      </Modal>

      {/* To Account Picker Modal */}
      <Modal open={showToAccountPicker} onClose={() => setShowToAccountPicker(false)} title="Select To Account">
        <div className="space-y-1.5">
          {activeAccounts.filter(a => a.id !== accountId).map(a => (
            <button
              key={a.id}
              onClick={() => { setToAccountId(a.id); setShowToAccountPicker(false); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                toAccountId === a.id ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-500' : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-lg">{a.icon}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Category Picker Modal */}
      <Modal open={showCategoryPicker} onClose={() => { setShowCategoryPicker(false); setShowNewCategory(false); setCatSearch(''); }} title="Select Category">
        <div className="space-y-3">
          <input
            value={catSearch}
            onChange={e => setCatSearch(e.target.value)}
            onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
            placeholder="Search categories..."
            className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
          />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {sortedCategories.filter(c => !catSearch || c.name.toLowerCase().includes(catSearch.toLowerCase())).map(c => (
              <div key={c.id}>
                <button
                  onClick={() => { setCategoryId(c.id); setShowCategoryPicker(false); }}
                  className={`w-full flex flex-col items-center gap-1 sm:gap-1.5 p-2 sm:p-3 rounded-xl transition-all ${
                    categoryId === c.id
                      ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                      : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  <span className="text-xl sm:text-2xl">{c.icon}</span>
                  <span className="text-[10px] sm:text-[11px] text-gray-700 dark:text-gray-300 truncate w-full text-center">
                    {c.name}
                  </span>
                </button>
              </div>
            ))}
          </div>
          {/* Inline add category */}
          {showNewCategory ? (
            <div className="flex gap-2">
              <input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="flex-1 p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && newCatName.trim()) {
                    if (categories.some(c => c.name.toLowerCase() === newCatName.trim().toLowerCase())) {
                      showToast(`Category "${newCatName.trim()}" already exists`, 'error');
                      return;
                    }
                    addCategory(newCatName.trim(), '📦', '#6b7280', type === 'income' ? 'income' : 'expense');
                    setNewCatName(''); setShowNewCategory(false);
                  }
                }}
              />
              <button
                onClick={() => { if (newCatName.trim()) { if (categories.some(c => c.name.toLowerCase() === newCatName.trim().toLowerCase())) { showToast(`Category "${newCatName.trim()}" already exists`, 'error'); return; } addCategory(newCatName.trim(), '📦', '#6b7280', type === 'income' ? 'income' : 'expense'); setNewCatName(''); setShowNewCategory(false); } }}
                className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium"
              >Add</button>
            </div>
          ) : (
            <button onClick={() => setShowNewCategory(true)} className="w-full p-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 text-sm hover:border-emerald-500 hover:text-emerald-500 transition-colors">
              + New Category
            </button>
          )}
        </div>
      </Modal>

      {/* Receipt Preview */}
      {showReceiptPreview && receiptPhoto && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowReceiptPreview(false)}
        >
          <button
            onClick={() => setShowReceiptPreview(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full text-white text-xl flex items-center justify-center z-10"
          >
            ✕
          </button>
          <img
            src={receiptPhoto}
            alt="Receipt"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Currency Converter */}
      <CurrencyConverter open={showConverter} onClose={() => setShowConverter(false)}
        onConvert={(phpAmount) => setDisplay(String(phpAmount))} />

      {/* Split Transaction */}
      <SplitTransaction
        open={showSplit} onClose={() => setShowSplit(false)}
        totalAmount={parseFloat(display) || 0}
        categories={sortedCategories}
        onSplit={async (entries) => {
          for (const entry of entries) {
            await addTransaction({
              amount: entry.amount, type, category_id: entry.categoryId,
              account_id: accountId, to_account_id: null,
              date: `${date}T${time}`, notes: entry.notes,
            } as any, []);
          }
          showToast(`Split into ${entries.length} entries`, 'success');
          goBack();
        }}
      />
    </div>
  );
}
