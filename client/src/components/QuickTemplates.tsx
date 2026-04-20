import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from './Toast';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import SortableList from './SortableList';
import { formatCurrency } from '../utils/formatters';
import type { TransactionType, Category, Account } from '../types';

// ── Types ──
//
// NOTE: Templates are stored in localStorage and can be exported/imported across
// installs. Numeric IDs are NOT portable because the DB reassigns auto-increment
// IDs on a fresh install. We store both name + ID so that:
//  - apply time prefers the NAME (stable across installs)
//  - the legacy ID is kept as a fallback for older templates
//
// When saving a template, populate both fields. When applying, resolve by name
// first; if that fails, try the ID. See resolveTemplateEntry() below.

export interface TemplateEntry {
  amount: number;
  type: TransactionType;
  categoryId: number | null;
  categoryName?: string | null;    // added: stable across installs
  accountId: number;
  accountName?: string;            // added
  toAccountId?: number | null;
  toAccountName?: string | null;   // added
  notes: string;
}

export interface Template {
  id: string;
  name: string;
  entries: TemplateEntry[];
  active?: boolean; // default true
  lastApplied?: string; // ISO date of last apply
}

const STORAGE_KEY = 'tracecash_templates_v2';

function loadTemplates(): Template[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveTemplates(templates: Template[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

/** Populate missing name fields on a TemplateEntry by looking up current IDs. Used when saving. */
function enrichEntryWithNames(
  entry: TemplateEntry,
  categories: Category[],
  accounts: Account[],
): TemplateEntry {
  const catName = entry.categoryId != null
    ? categories.find(c => c.id === entry.categoryId)?.name ?? null
    : null;
  const accName = accounts.find(a => a.id === entry.accountId)?.name;
  const toAccName = entry.toAccountId != null
    ? accounts.find(a => a.id === entry.toAccountId)?.name ?? null
    : null;
  return {
    ...entry,
    categoryName: catName,
    accountName: accName,
    toAccountName: toAccName,
  };
}

/** Look up the current Category for a template entry, preferring name over ID. Used for display. */
export function findEntryCategory(entry: TemplateEntry, categories: Category[]): Category | undefined {
  if (entry.categoryName) {
    const byName = categories.find(c => c.name === entry.categoryName);
    if (byName) return byName;
  }
  if (entry.categoryId != null) return categories.find(c => c.id === entry.categoryId);
  return undefined;
}

/** Look up the current Account for a template entry by accountId/accountName, preferring name. */
export function findEntryAccount(entry: TemplateEntry, accounts: Account[]): Account | undefined {
  if (entry.accountName) {
    const byName = accounts.find(a => a.name === entry.accountName);
    if (byName) return byName;
  }
  return accounts.find(a => a.id === entry.accountId);
}

/** Look up the current toAccount for a template entry, preferring name. */
export function findEntryToAccount(entry: TemplateEntry, accounts: Account[]): Account | undefined {
  if (entry.toAccountName) {
    const byName = accounts.find(a => a.name === entry.toAccountName);
    if (byName) return byName;
  }
  if (entry.toAccountId != null) return accounts.find(a => a.id === entry.toAccountId);
  return undefined;
}

/** Resolve a TemplateEntry to current DB IDs at apply time. Prefers name lookup (portable across installs). */
function resolveEntryIds(
  entry: TemplateEntry,
  categories: Category[],
  accounts: Account[],
): { categoryId: number | null; accountId: number | null; toAccountId: number | null } {
  // Category: prefer name, fall back to stored ID
  let categoryId: number | null = null;
  if (entry.categoryName) {
    const found = categories.find(c => c.name === entry.categoryName);
    if (found) categoryId = found.id;
  }
  if (categoryId == null && entry.categoryId != null) {
    // Legacy template without name — use stored ID if a matching category still exists
    const found = categories.find(c => c.id === entry.categoryId);
    if (found) categoryId = found.id;
  }

  // Account: prefer name (account is required, not nullable)
  let accountId: number | null = null;
  if (entry.accountName) {
    const found = accounts.find(a => a.name === entry.accountName);
    if (found) accountId = found.id;
  }
  if (accountId == null) {
    const found = accounts.find(a => a.id === entry.accountId);
    if (found) accountId = found.id;
  }

  // toAccount: prefer name
  let toAccountId: number | null = null;
  if (entry.toAccountName) {
    const found = accounts.find(a => a.name === entry.toAccountName);
    if (found) toAccountId = found.id;
  }
  if (toAccountId == null && entry.toAccountId != null) {
    const found = accounts.find(a => a.id === entry.toAccountId);
    if (found) toAccountId = found.id;
  }

  return { categoryId, accountId, toAccountId };
}

// ── Hook ──

export function useTemplates() {
  const { categories, accounts } = useData();
  const [templates, setTemplates] = useState<Template[]>(loadTemplates);

  // One-shot migration: once categories/accounts are loaded, backfill missing
  // name fields on any legacy templates (saved before names were stored).
  useEffect(() => {
    if (categories.length === 0 || accounts.length === 0) return;
    const needsMigration = templates.some(t =>
      t.entries.some(e => e.categoryName === undefined || e.accountName === undefined)
    );
    if (!needsMigration) return;
    const migrated = templates.map(t => ({
      ...t,
      entries: t.entries.map(e => enrichEntryWithNames(e, categories, accounts)),
    }));
    setTemplates(migrated);
    saveTemplates(migrated);
  }, [categories, accounts]);

  const addTemplate = (t: Omit<Template, 'id'>) => {
    const entries = t.entries.map(e => enrichEntryWithNames(e, categories, accounts));
    const updated = [...templates, { ...t, entries, id: Date.now().toString() }];
    setTemplates(updated);
    saveTemplates(updated);
  };

  const updateTemplate = (id: string, data: Omit<Template, 'id'>) => {
    const entries = data.entries.map(e => enrichEntryWithNames(e, categories, accounts));
    const updated = templates.map(t => t.id === id ? { ...data, entries, id } : t);
    setTemplates(updated);
    saveTemplates(updated);
  };

  const removeTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  };

  const toggleTemplateActive = (id: string) => {
    const updated = templates.map(t => t.id === id ? { ...t, active: t.active === false ? true : false } : t);
    setTemplates(updated);
    saveTemplates(updated);
  };

  const reorderTemplates = (fromIdx: number, dir: -1 | 1) => {
    const toIdx = fromIdx + dir;
    if (toIdx < 0 || toIdx >= templates.length) return;
    const updated = [...templates];
    [updated[fromIdx], updated[toIdx]] = [updated[toIdx], updated[fromIdx]];
    setTemplates(updated);
    saveTemplates(updated);
  };

  const reorderTemplatesByIds = (ids: (string | number)[]) => {
    const idMap = new Map(templates.map(t => [t.id, t]));
    const updated = ids.map(id => idMap.get(String(id))!).filter(Boolean);
    setTemplates(updated);
    saveTemplates(updated);
  };

  const markApplied = (id: string, date: string) => {
    const updated = templates.map(t => t.id === id ? { ...t, lastApplied: date } : t);
    setTemplates(updated);
    saveTemplates(updated);
  };

  return { templates, addTemplate, updateTemplate, removeTemplate, toggleTemplateActive, reorderTemplates, reorderTemplatesByIds, markApplied };
}

// ── Apply Template (creates all entries at once) ──

export function useApplyTemplate() {
  const { addTransaction, categories, accounts } = useData();
  const { showToast } = useToast();

  const apply = async (template: Template, date?: string) => {
    const dateStr = date || `${new Date().toISOString().slice(0, 10)}T${new Date().toTimeString().slice(0, 5)}`;
    let created = 0;
    let skipped = 0;
    for (const entry of template.entries) {
      const { categoryId, accountId, toAccountId } = resolveEntryIds(entry, categories, accounts);
      if (accountId == null) {
        // Account is required for any transaction — skip if name + ID both don't resolve.
        console.warn(`Template entry skipped — account "${entry.accountName ?? entry.accountId}" not found`);
        skipped++;
        continue;
      }
      try {
        await addTransaction({
          amount: entry.amount,
          type: entry.type,
          category_id: categoryId,
          account_id: accountId,
          to_account_id: toAccountId,
          date: dateStr,
          notes: entry.notes,
        });
        created++;
      } catch (e) { console.error('Template entry failed:', e); skipped++; }
    }
    const msg = skipped > 0
      ? `Applied "${template.name}" — ${created} created, ${skipped} skipped (missing account/category)`
      : `Applied "${template.name}" — ${created} entries created`;
    showToast(msg, skipped > 0 ? 'info' : 'success');
    return created;
  };

  return { apply };
}

// ── Template List (for Dashboard / quick access) ──

export default function QuickTemplateBar({ onApplied }: { onApplied?: () => void } = {}) {
  const { templates, markApplied } = useTemplates();
  const { apply } = useApplyTemplate();
  const { categories, accounts } = useData();
  const [applyConfirm, setApplyConfirm] = useState<Template | null>(null);
  const [applyDate, setApplyDate] = useState(new Date().toISOString().slice(0, 10));
  const [dupWarning, setDupWarning] = useState(false);

  const activeTemplates = templates.filter(t => t.active !== false);
  if (activeTemplates.length === 0) return null;

  const handleApplyClick = (t: Template) => {
    const today = new Date().toISOString().slice(0, 10);
    setApplyConfirm(t);
    setApplyDate(today);
    // Check if already applied today
    setDupWarning(t.lastApplied === today);
  };

  return (
    <>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Quick Templates</p>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {activeTemplates.map(t => {
            const appliedToday = t.lastApplied === new Date().toISOString().slice(0, 10);
            return (
              <button
                key={t.id}
                onClick={() => handleApplyClick(t)}
                className={`flex-shrink-0 px-3 py-2 border rounded-xl transition-colors ${
                  appliedToday
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-500'
                }`}
              >
                <p className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">{t.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {t.entries.length} entries · {formatCurrency(t.entries.reduce((s, e) => s + e.amount, 0))}
                  {appliedToday && <span className="ml-1 text-emerald-500">✓</span>}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Apply confirmation */}
      <Modal open={!!applyConfirm} onClose={() => setApplyConfirm(null)} title={`Apply "${applyConfirm?.name}"`}>
        {applyConfirm && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">This will create {applyConfirm.entries.length} entries:</p>
              <div className="space-y-2">
                {applyConfirm.entries.map((e, i) => {
                  const cat = findEntryCategory(e, categories);
                  const acc = findEntryAccount(e, accounts);
                  const toAcc = findEntryToAccount(e, accounts);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-100 dark:border-gray-600">
                      <span className="text-base flex-shrink-0">{cat?.icon ?? (e.type === 'transfer' ? '🔄' : '📦')}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${e.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : e.type === 'transfer' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                            {e.type === 'income' ? 'INC' : e.type === 'transfer' ? 'TRF' : 'EXP'}
                          </span>
                          <span className="text-gray-900 dark:text-white font-medium truncate">{cat?.name ?? (e.notes || 'No category')}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400">
                          <span>{acc?.icon ?? '💰'} {acc?.name ?? 'Unknown'}</span>
                          {toAcc && <span>→ {toAcc.icon} {toAcc.name}</span>}
                          {e.notes && cat?.name && <span>· {e.notes}</span>}
                        </div>
                      </div>
                      <span className={`font-bold flex-shrink-0 ${e.type === 'income' ? 'text-emerald-500' : e.type === 'transfer' ? 'text-blue-500' : 'text-red-500'}`}>
                        {formatCurrency(e.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2 flex justify-between text-xs font-bold">
                <span className="text-gray-700 dark:text-gray-300">Total</span>
                <span className="text-gray-900 dark:text-white">{formatCurrency(applyConfirm.entries.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
            </div>
            {dupWarning && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5">
                <p className="text-[11px] text-amber-700 dark:text-amber-300">⚠️ You already applied this template today. Apply again?</p>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date for entries</label>
              <input
                type="date"
                value={applyDate}
                onChange={e => { setApplyDate(e.target.value); setDupWarning(applyConfirm.lastApplied === e.target.value); }}
                className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={async () => {
                await apply(applyConfirm, `${applyDate}T${new Date().toTimeString().slice(0, 5)}`);
                markApplied(applyConfirm.id, applyDate);
                setApplyConfirm(null);
                setDupWarning(false);
                onApplied?.();
              }}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium"
            >
              Apply {applyConfirm.entries.length} Entries
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Full Template Manager (for Settings or standalone page) ──

export function TemplateManager() {
  const { templates, addTemplate, updateTemplate, removeTemplate, toggleTemplateActive, reorderTemplatesByIds } = useTemplates();
  const { categories, accounts } = useData();
  const { showToast } = useToast();

  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [entries, setEntries] = useState<TemplateEntry[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const openNew = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setEntries([{ amount: 0, type: 'expense', categoryId: null, accountId: accounts[0]?.id ?? 1, notes: '' }]);
  };

  const openEdit = (t: Template) => {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setEntries([...t.entries]);
  };

  const addEntry = () => {
    setEntries([...entries, { amount: 0, type: 'expense', categoryId: null, accountId: accounts[0]?.id ?? 1, notes: '' }]);
  };

  const updateEntry = (idx: number, field: string, value: unknown) => {
    const updated = [...entries];
    (updated[idx] as any)[field] = value;
    setEntries(updated);
  };

  const removeEntry = (idx: number) => {
    setEntries(entries.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!templateName.trim()) { showToast('Enter a template name', 'error'); return; }
    if (entries.some(e => e.amount <= 0)) { showToast('All entries must have an amount greater than 0', 'error'); return; }
    if (entries.length === 0) { showToast('Add at least one entry', 'error'); return; }
    const validEntries = entries;

    if (editingTemplate) {
      updateTemplate(editingTemplate.id, { name: templateName.trim(), entries: validEntries });
      showToast('Template updated', 'success');
    } else {
      addTemplate({ name: templateName.trim(), entries: validEntries });
      showToast('Template created', 'success');
    }
    setEditingTemplate(null);
    setTemplateName('');
    setEntries([]);
  };

  const isEditorOpen = templateName !== '' || entries.length > 0;

  const inputClass = "w-full p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white";

  return (
    <div className="space-y-3">
      {/* Template list */}
      {!isEditorOpen && (
        <>
          <button onClick={openNew} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
            + Create Template
          </button>

          {templates.length === 0 ? (
            <div className="text-center text-gray-400 py-6 text-sm">
              <p>No templates yet</p>
              <p className="text-[10px] mt-1">Create a template for repeating sets of entries (e.g. "Work Day")</p>
            </div>
          ) : (
            <SortableList
              items={templates}
              onReorder={(ids) => reorderTemplatesByIds(ids)}
              renderItem={(t) => (
              <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-3 ${t.active === false ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {t.active === false && <span className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5">Inactive</span>}
                    <div>
                      <p className={`text-sm font-semibold ${t.active === false ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>{t.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {t.entries.length} entries · {formatCurrency(t.entries.reduce((s, e) => s + e.amount, 0))}
                        {t.lastApplied && <span className="ml-1">· Last: {t.lastApplied}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleTemplateActive(t.id)}
                      className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${t.active !== false ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${t.active !== false ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                    <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-blue-500 text-sm">✏️</button>
                    <button onClick={() => setDeleteConfirm(t.id)} className="text-gray-400 hover:text-red-500 text-sm">🗑️</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {t.entries.map((e, i) => {
                    const cat = findEntryCategory(e, categories);
                    const acc = findEntryAccount(e, accounts);
                    return (
                      <div key={i} className="flex items-center justify-between text-[11px] bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span>{cat?.icon ?? '📦'}</span>
                          <span className="text-gray-700 dark:text-gray-300">{cat?.name ?? 'No category'}</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-400">{acc?.name ?? 'Unknown'}</span>
                        </div>
                        <span className={`font-medium ${e.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {formatCurrency(e.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            />
          )}
        </>
      )}

      {/* Template editor */}
      {isEditorOpen && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {editingTemplate ? 'Edit Template' : 'New Template'}
            </h3>
            <button onClick={() => { setTemplateName(''); setEntries([]); setEditingTemplate(null); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>

          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="Template name (e.g. Work Day)"
            className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white"
            autoFocus
          />

          {/* Entries */}
          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-2 relative">
                {entries.length > 1 && (
                  <button
                    onClick={() => removeEntry(idx)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs"
                  >✕</button>
                )}
                <p className="text-[10px] text-gray-400 font-semibold uppercase">Entry {idx + 1}</p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-gray-400 mb-0.5 block">Type</label>
                    <select value={entry.type} onChange={e => updateEntry(idx, 'type', e.target.value)} className={inputClass}>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400 mb-0.5 block">Amount (₱)</label>
                    <input
                      type="number"
                      value={entry.amount || ''}
                      onChange={e => updateEntry(idx, 'amount', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className={`${inputClass} ${entry.amount <= 0 ? 'border-red-400 dark:border-red-500' : ''}`}
                      inputMode="decimal"
                    />
                    {entry.amount <= 0 && (
                      <p className="text-[9px] text-red-400 mt-0.5">Amount must be greater than 0</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-gray-400 mb-0.5 block">Category</label>
                    <select
                      value={entry.categoryId ?? ''}
                      onChange={e => updateEntry(idx, 'categoryId', e.target.value ? Number(e.target.value) : null)}
                      className={inputClass}
                    >
                      <option value="">None</option>
                      {categories
                        .filter(c => entry.type === 'transfer' ? false : c.type === entry.type || c.type === 'both')
                        .filter(c => !c.name.startsWith('_') && c.icon !== '??' && c.icon !== '?')
                        .map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400 mb-0.5 block">Account</label>
                    <select
                      value={entry.accountId}
                      onChange={e => updateEntry(idx, 'accountId', Number(e.target.value))}
                      className={inputClass}
                    >
                      {accounts.filter(a => a.active !== false).map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 mb-0.5 block">Notes (optional)</label>
                  <input
                    value={entry.notes}
                    onChange={e => updateEntry(idx, 'notes', e.target.value)}
                    placeholder="Notes"
                    className={inputClass}
                  />
                </div>
              </div>
            ))}

            <button
              onClick={addEntry}
              className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-400 hover:border-emerald-500 hover:text-emerald-500 transition-colors"
            >
              + Add Entry
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={!templateName.trim() || entries.some(e => e.amount <= 0) || entries.length === 0}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium"
          >
            {editingTemplate ? 'Update Template' : 'Save Template'}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) { removeTemplate(deleteConfirm); setDeleteConfirm(null); showToast('Template deleted', 'success'); } }}
        title="Delete Template"
        message="Are you sure you want to delete this template?"
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
