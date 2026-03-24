import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import Modal from '../components/Modal';
import QuickTemplateBar from '../components/QuickTemplates';
import type { TransactionType } from '../types';

export default function AddTransaction() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { categories, accounts, tags, addTransaction, editTransaction, transactions,
    addAccount, addCategory, addTag } = useData();

  const editId = params.get('edit') ? Number(params.get('edit')) : null;
  const editTx = editId ? transactions.find(t => t.id === editId) : null;
  const returnTo = params.get('returnTo');

  const goBack = () => {
    if (returnTo) navigate(returnTo);
    else navigate(-1);
  };

  const [type, setType] = useState<TransactionType>(editTx?.type ?? 'expense');
  const [display, setDisplay] = useState(editTx ? String(editTx.amount) : '0');
  const [categoryId, setCategoryId] = useState<number | null>(editTx?.category_id ?? null);
  const [accountId, setAccountId] = useState<number>(editTx?.account_id ?? accounts[0]?.id ?? 1);
  const [toAccountId, setToAccountId] = useState<number | null>(editTx?.to_account_id ?? null);
  const [date, setDate] = useState(editTx?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(editTx?.date?.slice(11, 16) ?? new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState(editTx?.notes ?? '');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [freshEntry, setFreshEntry] = useState(true);

  // Inline create states
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    if (accounts.length > 0 && !editTx) setAccountId(accounts[0].id);
  }, [accounts]);

  const filteredCategories = categories.filter(c =>
    type === 'transfer' ? false : c.type === type || c.type === 'both'
  );

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
    if (!amount || amount <= 0) return;
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
      if (editTx) {
        await editTransaction({ ...editTx, ...data }, selectedTags);
      } else {
        await addTransaction(data as any, selectedTags);
      }
      goBack();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const typeColor = type === 'income' ? 'text-emerald-400' : type === 'transfer' ? 'text-blue-400' : 'text-red-400';

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
          <button
            onClick={handleSubmit}
            disabled={saving || parseFloat(display) <= 0}
            className="text-emerald-400 font-medium text-xs sm:text-sm flex items-center gap-1 disabled:opacity-40"
          >
            ✓ SAVE
          </button>
        </div>

        {/* Type Selector */}
        <div className="flex items-center justify-center px-4 py-1 sm:py-2">
          {(['income', 'expense', 'transfer'] as const).map((t, i) => (
            <div key={t} className="flex items-center">
              {i > 0 && <span className="text-gray-600 mx-2 sm:mx-3">|</span>}
              <button
                onClick={() => setType(t)}
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
              onClick={() => setShowAccountPicker(true)}
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
        {!editTx && <QuickTemplateBar onApplied={goBack} />}

        {/* Notes */}
        <div className="px-3 sm:px-4 py-1">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes"
            rows={2}
            className="w-full p-2 sm:p-3 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-gray-200 placeholder-gray-500 resize-none"
          />
        </div>

        {/* Tags row */}
        <div className="px-3 sm:px-4 py-0.5 sm:py-1 flex gap-1.5 overflow-x-auto">
          {tags.map(tag => (
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
                    addTag(newTagName.trim(), '#3b82f6');
                    setNewTagName(''); setShowNewTag(false);
                  }
                  if (e.key === 'Escape') setShowNewTag(false);
                }}
              />
              <button
                onClick={() => { if (newTagName.trim()) { addTag(newTagName.trim(), '#3b82f6'); setNewTagName(''); setShowNewTag(false); } }}
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
        <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-800 mx-3 sm:mx-4 rounded-xl flex items-center justify-end gap-2 sm:gap-3">
          <span className={`text-3xl sm:text-5xl font-light ${typeColor} tracking-tight truncate`}>
            {display === '0' ? '0' : display}
          </span>
          <button onClick={handleBackspace} className="text-gray-400 text-lg sm:text-xl p-1 flex-shrink-0">⌫</button>
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
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-transparent text-gray-300 text-xs sm:text-sm border-none outline-none"
          />
          <span className="text-gray-600">|</span>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="bg-transparent text-gray-300 text-xs sm:text-sm border-none outline-none"
          />
        </div>
      </div>

      {/* Account Picker Modal */}
      <Modal open={showAccountPicker} onClose={() => { setShowAccountPicker(false); setShowNewAccount(false); }} title="Select Account">
        <div className="space-y-1.5">
          {accounts.map(a => (
            <button
              key={a.id}
              onClick={() => { setAccountId(a.id); setShowAccountPicker(false); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                accountId === a.id ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-500' : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-lg">{a.icon}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</span>
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
                    addAccount(newAccName.trim(), '💰', '#10b981', 0);
                    setNewAccName(''); setShowNewAccount(false);
                  }
                }}
              />
              <button
                onClick={() => { if (newAccName.trim()) { addAccount(newAccName.trim(), '💰', '#10b981', 0); setNewAccName(''); setShowNewAccount(false); } }}
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
          {accounts.filter(a => a.id !== accountId).map(a => (
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
      <Modal open={showCategoryPicker} onClose={() => { setShowCategoryPicker(false); setShowNewCategory(false); }} title="Select Category">
        <div className="space-y-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {filteredCategories.map(c => (
              <button
                key={c.id}
                onClick={() => { setCategoryId(c.id); setShowCategoryPicker(false); }}
                className={`flex flex-col items-center gap-1 sm:gap-1.5 p-2 sm:p-3 rounded-xl transition-all ${
                  categoryId === c.id
                    ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                    : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <span className="text-xl sm:text-2xl">{c.icon}</span>
                <span className="text-[10px] sm:text-[11px] text-gray-700 dark:text-gray-300 truncate w-full text-center">{c.name}</span>
              </button>
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
                    addCategory(newCatName.trim(), '📦', '#6b7280', type === 'income' ? 'income' : 'expense');
                    setNewCatName(''); setShowNewCategory(false);
                  }
                }}
              />
              <button
                onClick={() => { if (newCatName.trim()) { addCategory(newCatName.trim(), '📦', '#6b7280', type === 'income' ? 'income' : 'expense'); setNewCatName(''); setShowNewCategory(false); } }}
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
    </div>
  );
}
