import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import TransactionCard from '../components/TransactionCard';
import BudgetProgress from '../components/BudgetProgress';
import { TemplateManager } from '../components/QuickTemplates';
import { getCurrentMonth, formatMonth, formatCurrency } from '../utils/formatters';
import type { Category, Account, Transaction, RecurringTransaction, RecurrenceType, TransactionType } from '../types';

export default function Settings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { dark, toggle } = useTheme();
  const {
    categories, accounts, tags, budgets, recurring,
    addCategory, editCategory, removeCategory, getTransactionsByDate,
    addAccount, editAccount, removeAccount,
    addTag, removeTag,
    loadBudgets, saveBudget, removeBudget,
    loadRecurring, addRecurring, removeRecurring,
    exportCsv, refresh,
  } = useData();

  const [activeTab, setActiveTab] = useState<'general' | 'categories' | 'accounts' | 'tags' | 'budgets' | 'recurring' | 'templates'>('general');
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);

  // Load ALL transactions when categories tab is opened (not period-filtered)
  useEffect(() => {
    if (activeTab === 'categories') {
      getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59').then(setAllTransactions);
    }
  }, [activeTab]);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');

  // Category form
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('📦');
  const [catColor, setCatColor] = useState('#6b7280');
  const [catType, setCatType] = useState<string>('expense');
  const [editCatId, setEditCatId] = useState<number | null>(null);

  // Account form
  const [accName, setAccName] = useState('');
  const [accIcon, setAccIcon] = useState('💰');
  const [accColor, setAccColor] = useState('#10b981');
  const [accBalance, setAccBalance] = useState('0');
  const [editAccId, setEditAccId] = useState<number | null>(null);

  // Tag form
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3b82f6');

  // Budget form
  const [budgetMonth, setBudgetMonth] = useState(getCurrentMonth());
  const [budgetCatId, setBudgetCatId] = useState<number | ''>('');
  const [budgetAmount, setBudgetAmount] = useState('');

  // Recurring form
  const [recAmount, setRecAmount] = useState('');
  const [recType, setRecType] = useState<TransactionType>('expense');
  const [recCatId, setRecCatId] = useState<number | ''>('');
  const [recAccId, setRecAccId] = useState<number | ''>('');
  const [recNotes, setRecNotes] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('monthly');
  const [recNextDate, setRecNextDate] = useState(new Date().toISOString().slice(0, 10));

  // CSV import
  const [importFile, setImportFile] = useState<File | null>(null);

  const openModal = (type: string) => {
    setModalType(type);
    setShowModal(true);
    // Reset forms
    setCatName(''); setCatIcon('📦'); setCatColor('#6b7280'); setCatType('expense'); setEditCatId(null);
    setAccName(''); setAccIcon('💰'); setAccColor('#10b981'); setAccBalance('0'); setEditAccId(null);
    setTagName(''); setTagColor('#3b82f6');
    setBudgetCatId(''); setBudgetAmount('');
    setRecAmount(''); setRecType('expense'); setRecCatId(''); setRecAccId(''); setRecNotes('');
  };

  const handleSaveCategory = async () => {
    if (!catName) return;
    if (editCatId) {
      await editCategory(editCatId, catName, catIcon, catColor, catType);
    } else {
      await addCategory(catName, catIcon, catColor, catType);
    }
    setShowModal(false);
  };

  const handleEditCat = (c: Category) => {
    setEditCatId(c.id); setCatName(c.name); setCatIcon(c.icon); setCatColor(c.color); setCatType(c.type);
    setModalType('category'); setShowModal(true);
  };

  const handleSaveAccount = async () => {
    if (!accName) return;
    if (editAccId) {
      await editAccount(editAccId, accName, accIcon, accColor);
    } else {
      await addAccount(accName, accIcon, accColor, Number(accBalance));
    }
    setShowModal(false);
  };

  const handleEditAcc = (a: Account) => {
    setEditAccId(a.id); setAccName(a.name); setAccIcon(a.icon); setAccColor(a.color);
    setModalType('account'); setShowModal(true);
  };

  const handleSaveTag = async () => {
    if (!tagName) return;
    await addTag(tagName, tagColor);
    setShowModal(false);
  };

  const handleSaveBudget = async () => {
    if (!budgetAmount) return;
    await saveBudget(budgetCatId || null, Number(budgetAmount), budgetMonth);
    setShowModal(false);
    await loadBudgets(budgetMonth);
  };

  const handleSaveRecurring = async () => {
    if (!recAmount || !recAccId) return;
    await addRecurring({
      amount: Number(recAmount),
      type: recType,
      category_id: recCatId || null,
      account_id: recAccId as number,
      notes: recNotes,
      recurrence_type: recurrence,
      next_date: recNextDate,
    });
    setShowModal(false);
    await loadRecurring();
  };

  const handleExportXlsx = async () => {
    try {
      const response = await fetch('/api/export/xlsx');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mymoney_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleExportCsv = async () => {
    try {
      const csv = await exportCsv();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mymoney_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImportCsv = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', importFile);
    try {
      const response = await fetch('/api/import/csv', { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) {
        // Format result message based on response shape
        if (data.transactions !== undefined) {
          // Full backup format
          const parts = [];
          if (data.accounts) parts.push(`${data.accounts} accounts`);
          if (data.categories) parts.push(`${data.categories} categories`);
          if (data.tags) parts.push(`${data.tags} tags`);
          if (data.budgets) parts.push(`${data.budgets} budgets`);
          if (data.recurring) parts.push(`${data.recurring} recurring`);
          if (data.transactions) parts.push(`${data.transactions} transactions`);
          setImportResult(`Imported: ${parts.join(', ')}${data.errors?.length ? ` (${data.errors.length} errors)` : ''}`);
        } else {
          // Legacy format
          setImportResult(`Imported ${data.imported} transactions, ${data.skipped} skipped${data.errors?.length ? `, ${data.errors.length} errors` : ''}`);
        }
        await refresh();
      } else {
        setImportResult(`Error: ${data.error || 'Import failed'}`);
      }
    } catch (err) {
      setImportResult('Error: Network or server failure');
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const colors = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899','#f43f5e','#6b7280','#0ea5e9','#d97706','#7c3aed'];
  const icons = ['📦','🍔','🍱','🚌','🚆','🏠','📡','🦷','🍚','💊','🛒','🛍️','📱','🎉','💪','🐾','👕','💵','🎁','🏦','💸','🎮','📚','✈️','🎬','☕','🍕','🚗','💡','💰','🌊','📱'];

  const tabs = [
    { key: 'general', label: '⚙️ General' },
    { key: 'categories', label: '📂 Categories' },
    { key: 'accounts', label: '🏦 Accounts' },
    { key: 'tags', label: '🏷️ Tags' },
    { key: 'budgets', label: '🎯 Budgets' },
    { key: 'recurring', label: '🔄 Recurring' },
    { key: 'templates', label: '📋 Templates' },
  ] as const;

  const inputClass = "w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 pt-4 pb-8 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'budgets') loadBudgets(budgetMonth); if (tab.key === 'recurring') loadRecurring(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === tab.key ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
            <span className="text-sm text-gray-900 dark:text-white">Dark Mode</span>
            <button onClick={toggle} className={`w-12 h-6 rounded-full transition-colors ${dark ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${dark ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {/* Export */}
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">📥 Export Full Backup</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              All data in one file: Accounts, Categories, Tags, Budgets, Recurring, Transactions — each in its own sheet
            </p>
            <div className="flex gap-2">
              <button onClick={handleExportXlsx} className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium">
                Download .xlsx
              </button>
              <button onClick={handleExportCsv} className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium">
                Download .csv
              </button>
            </div>
          </div>

          {/* PDF Report */}
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">📄 Monthly PDF Report</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Generate a formatted financial report with summary, category breakdown, and transaction list
            </p>
            <div className="flex gap-2 items-center">
              <input type="month" defaultValue={new Date().toISOString().slice(0, 7)} id="pdf-month"
                className="p-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white" />
              <button
                onClick={() => {
                  const month = (document.getElementById('pdf-month') as HTMLInputElement)?.value || new Date().toISOString().slice(0, 7);
                  window.open(`/api/export/pdf?month=${month}`, '_blank');
                }}
                className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium"
              >
                Download PDF
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">📤 Import Backup</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Supports: .xlsx (multi-sheet backup), .csv (legacy MyMoney app format)
            </p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }} className="text-xs text-gray-500" />
            {importFile && (
              <button
                onClick={handleImportCsv}
                disabled={importing}
                className="mt-2 px-4 py-1.5 bg-emerald-500 disabled:bg-gray-400 text-white rounded-lg text-xs font-medium"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            )}
            {importResult && (
              <p className={`mt-2 text-xs ${importResult.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>
                {importResult}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && <CategoriesTab
        categories={categories}
        transactions={allTransactions}
        onAdd={() => openModal('category')}
        onEdit={handleEditCat}
        onDelete={async (id: number) => {
          try { await removeCategory(id); showToast('Category deleted', 'success'); }
          catch (e: any) { showToast(e?.response?.data?.error || 'Cannot delete: category is in use', 'error'); }
        }}
        navigate={navigate}
      />}

      {/* Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-2">
          <button onClick={() => openModal('account')} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
            + Add Account
          </button>
          {accounts.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: a.color + '20' }}>
                {a.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</p>
              </div>
              <button onClick={() => handleEditAcc(a)} className="text-gray-400 hover:text-blue-500 text-sm">✏️</button>
              <button onClick={async () => {
                if (!confirm('Delete this account?')) return;
                try { await removeAccount(a.id); showToast('Account deleted', 'success'); }
                catch (e: any) { showToast(e?.response?.data?.error || 'Cannot delete: account is in use', 'error'); }
              }} className="text-gray-400 hover:text-red-500 text-sm">🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* Tags Tab */}
      {activeTab === 'tags' && (
        <div className="space-y-2">
          <button onClick={() => openModal('tag')} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
            + Add Tag
          </button>
          <div className="flex flex-wrap gap-2">
            {tags.map(t => (
              <div key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: t.color }}>
                {t.name}
                <button onClick={async () => {
                  if (!confirm('Delete this tag?')) return;
                  try { await removeTag(t.id); showToast('Tag deleted', 'success'); }
                  catch (e: any) { showToast(e?.response?.data?.error || 'Cannot delete: tag is in use', 'error'); }
                }} className="ml-1 opacity-70 hover:opacity-100">&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budgets Tab */}
      {activeTab === 'budgets' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input type="month" value={budgetMonth} onChange={e => { setBudgetMonth(e.target.value); loadBudgets(e.target.value); }} className={inputClass + ' flex-1'} />
            <button onClick={() => openModal('budget')} className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium whitespace-nowrap">+ Budget</button>
          </div>
          <p className="text-xs text-gray-500">{formatMonth(budgetMonth)}</p>
          {budgets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No budgets set for this month</p>
          ) : (
            <div className="space-y-2">
              {budgets.map(b => (
                <div key={b.id} className="relative">
                  <BudgetProgress budget={b} />
                  <button onClick={() => { if (confirm('Delete?')) removeBudget(b.id); }} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recurring Tab */}
      {activeTab === 'recurring' && (
        <div className="space-y-2">
          <button onClick={() => openModal('recurring')} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
            + Add Recurring
          </button>
          {recurring.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No recurring transactions</p>
          ) : (
            recurring.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    ₱{r.amount.toLocaleString()} - {r.category_name ?? r.type}
                  </p>
                  <p className="text-xs text-gray-500">{r.recurrence_type} · {r.account_name} · Next: {r.next_date}</p>
                </div>
                <button onClick={() => { if (confirm('Delete?')) removeRecurring(r.id); }} className="text-gray-400 hover:text-red-500 text-sm">🗑️</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && <TemplateManager />}

      {/* Modals */}
      <Modal open={showModal && modalType === 'category'} onClose={() => setShowModal(false)} title={editCatId ? 'Edit Category' : 'Add Category'}>
        <div className="space-y-3">
          <input value={catName} onChange={e => setCatName(e.target.value)} placeholder="Category name" className={inputClass} />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {icons.map(i => (
                <button key={i} onClick={() => setCatIcon(i)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${catIcon === i ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {colors.map(c => (
                <button key={c} onClick={() => setCatColor(c)} className={`w-7 h-7 rounded-full ${catColor === c ? 'ring-2 ring-offset-2 ring-emerald-500' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <select value={catType} onChange={e => setCatType(e.target.value)} className={inputClass}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="both">Both</option>
          </select>
          <button onClick={handleSaveCategory} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>

      <Modal open={showModal && modalType === 'account'} onClose={() => setShowModal(false)} title={editAccId ? 'Edit Account' : 'Add Account'}>
        <div className="space-y-3">
          <input value={accName} onChange={e => setAccName(e.target.value)} placeholder="Account name" className={inputClass} />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {icons.slice(0, 16).map(i => (
                <button key={i} onClick={() => setAccIcon(i)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${accIcon === i ? 'ring-2 ring-emerald-500' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {colors.map(c => (
                <button key={c} onClick={() => setAccColor(c)} className={`w-7 h-7 rounded-full ${accColor === c ? 'ring-2 ring-offset-2 ring-emerald-500' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {!editAccId && <input type="number" value={accBalance} onChange={e => setAccBalance(e.target.value)} placeholder="Initial balance" className={inputClass} />}
          <button onClick={handleSaveAccount} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>

      <Modal open={showModal && modalType === 'tag'} onClose={() => setShowModal(false)} title="Add Tag">
        <div className="space-y-3">
          <input value={tagName} onChange={e => setTagName(e.target.value)} placeholder="Tag name" className={inputClass} />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {colors.map(c => (
                <button key={c} onClick={() => setTagColor(c)} className={`w-7 h-7 rounded-full ${tagColor === c ? 'ring-2 ring-offset-2 ring-emerald-500' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <button onClick={handleSaveTag} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>

      <Modal open={showModal && modalType === 'budget'} onClose={() => setShowModal(false)} title="Set Budget">
        <div className="space-y-3">
          <select value={budgetCatId} onChange={e => setBudgetCatId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
            <option value="">Overall Budget</option>
            {categories.filter(c => c.type !== 'income').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <input type="number" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} placeholder="Budget amount (₱)" className={inputClass} />
          <button onClick={handleSaveBudget} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>

      <Modal open={showModal && modalType === 'recurring'} onClose={() => setShowModal(false)} title="Add Recurring Transaction">
        <div className="space-y-3">
          <input type="number" value={recAmount} onChange={e => setRecAmount(e.target.value)} placeholder="Amount (₱)" className={inputClass} />
          <select value={recType} onChange={e => setRecType(e.target.value as TransactionType)} className={inputClass}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select value={recCatId} onChange={e => setRecCatId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
            <option value="">No category</option>
            {categories.filter(c => c.type === recType || c.type === 'both').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select value={recAccId} onChange={e => setRecAccId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
            <option value="">Select account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
          <input value={recNotes} onChange={e => setRecNotes(e.target.value)} placeholder="Notes (optional)" className={inputClass} />
          <select value={recurrence} onChange={e => setRecurrence(e.target.value as RecurrenceType)} className={inputClass}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input type="date" value={recNextDate} onChange={e => setRecNextDate(e.target.value)} className={inputClass} />
          <button onClick={handleSaveRecurring} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>
    </div>
  );
}

// ── Categories Tab with modal transaction list ──
function CategoriesTab({ categories, transactions, onAdd, onEdit, onDelete, navigate }: {
  categories: Category[];
  transactions: Transaction[];
  onAdd: () => void;
  onEdit: (c: Category) => void;
  onDelete: (id: number) => void;
  navigate: (path: string) => void;
}) {
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);

  const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both');
  const incomeCats = categories.filter(c => c.type === 'income' || c.type === 'both');

  const selectedCatTx = selectedCat
    ? transactions.filter(t => t.category_id === selectedCat.id)
    : [];
  const selectedCatTotal = selectedCatTx.reduce((s, t) => s + t.amount, 0);

  const renderCat = (c: Category) => {
    const txCount = transactions.filter(t => t.category_id === c.id).length;
    const total = transactions.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0);
    return (
      <div key={c.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
        <button
          onClick={() => setSelectedCat(c)}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: c.color + '25' }}>
            {c.icon}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{txCount} entries · {formatCurrency(total)}</p>
          </div>
          <span className="text-gray-400 dark:text-gray-500 text-xs">›</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(c); }} className="text-gray-400 hover:text-blue-500 text-sm flex-shrink-0">✏️</button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete category?')) onDelete(c.id); }} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">🗑️</button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <button onClick={onAdd} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
        + Add Category
      </button>

      {/* Expense Categories */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Expense Categories
          </h3>
          <span className="text-xs text-gray-400">({expenseCats.length})</span>
        </div>
        <div className="space-y-1.5">{expenseCats.map(renderCat)}</div>
      </div>

      {/* Income Categories */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Income Categories
          </h3>
          <span className="text-xs text-gray-400">({incomeCats.length})</span>
        </div>
        <div className="space-y-1.5">{incomeCats.map(renderCat)}</div>
      </div>

      {/* Category Transactions Modal */}
      <Modal open={!!selectedCat} onClose={() => setSelectedCat(null)} title={selectedCat ? `${selectedCat.icon} ${selectedCat.name}` : ''}>
        {selectedCat && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: selectedCat.color + '15' }}>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedCatTx.length} transactions</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(selectedCatTotal)}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{ backgroundColor: selectedCat.color + '25' }}>
                {selectedCat.icon}
              </div>
            </div>

            {/* Transaction list */}
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {selectedCatTx.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No transactions in this category</p>
              ) : (
                selectedCatTx.slice(0, 100).map(t => (
                  <TransactionCard
                    key={t.id}
                    transaction={t}
                    onEdit={() => { setSelectedCat(null); navigate(`/add?edit=${t.id}`); }}
                  />
                ))
              )}
              {selectedCatTx.length > 100 && (
                <p className="text-[10px] text-gray-400 text-center py-2">
                  Showing 100 of {selectedCatTx.length}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
