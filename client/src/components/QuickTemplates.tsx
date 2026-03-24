import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from './Toast';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { formatCurrency } from '../utils/formatters';
import type { TransactionType } from '../types';

// ── Types ──

export interface TemplateEntry {
  amount: number;
  type: TransactionType;
  categoryId: number | null;
  accountId: number;
  toAccountId?: number | null;
  notes: string;
}

export interface Template {
  id: string;
  name: string;
  entries: TemplateEntry[];
}

const STORAGE_KEY = 'tracecash_templates_v2';

function loadTemplates(): Template[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveTemplates(templates: Template[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

// ── Hook ──

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>(loadTemplates);

  const addTemplate = (t: Omit<Template, 'id'>) => {
    const updated = [...templates, { ...t, id: Date.now().toString() }];
    setTemplates(updated);
    saveTemplates(updated);
  };

  const updateTemplate = (id: string, data: Omit<Template, 'id'>) => {
    const updated = templates.map(t => t.id === id ? { ...data, id } : t);
    setTemplates(updated);
    saveTemplates(updated);
  };

  const removeTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  };

  return { templates, addTemplate, updateTemplate, removeTemplate };
}

// ── Apply Template (creates all entries at once) ──

export function useApplyTemplate() {
  const { addTransaction, categories, accounts } = useData();
  const { showToast } = useToast();

  const apply = async (template: Template, date?: string) => {
    const dateStr = date || `${new Date().toISOString().slice(0, 10)}T${new Date().toTimeString().slice(0, 5)}`;
    let created = 0;
    for (const entry of template.entries) {
      try {
        await addTransaction({
          amount: entry.amount,
          type: entry.type,
          category_id: entry.categoryId,
          account_id: entry.accountId,
          to_account_id: entry.toAccountId ?? null,
          date: dateStr,
          notes: entry.notes,
        });
        created++;
      } catch (e) { console.error('Template entry failed:', e); }
    }
    showToast(`Applied "${template.name}" — ${created} entries created`, 'success');
    return created;
  };

  return { apply };
}

// ── Template List (for Dashboard / quick access) ──

export default function QuickTemplateBar({ onApplied }: { onApplied?: () => void } = {}) {
  const { templates } = useTemplates();
  const { apply } = useApplyTemplate();
  const [applyConfirm, setApplyConfirm] = useState<Template | null>(null);
  const [applyDate, setApplyDate] = useState(new Date().toISOString().slice(0, 10));

  if (templates.length === 0) return null;

  return (
    <>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Quick Templates</p>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => { setApplyConfirm(t); setApplyDate(new Date().toISOString().slice(0, 10)); }}
              className="flex-shrink-0 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors"
            >
              <p className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">{t.name}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{t.entries.length} entries · {formatCurrency(t.entries.reduce((s, e) => s + e.amount, 0))}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Apply confirmation */}
      <Modal open={!!applyConfirm} onClose={() => setApplyConfirm(null)} title={`Apply "${applyConfirm?.name}"`}>
        {applyConfirm && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">This will create {applyConfirm.entries.length} entries:</p>
              <div className="space-y-1">
                {applyConfirm.entries.map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 dark:text-gray-300">{e.notes || e.type}</span>
                    <span className={`font-medium ${e.type === 'income' ? 'text-emerald-500' : e.type === 'transfer' ? 'text-blue-500' : 'text-red-500'}`}>
                      {formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2 flex justify-between text-xs font-bold">
                <span className="text-gray-700 dark:text-gray-300">Total</span>
                <span className="text-gray-900 dark:text-white">{formatCurrency(applyConfirm.entries.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date for entries</label>
              <input
                type="date"
                value={applyDate}
                onChange={e => setApplyDate(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={async () => {
                await apply(applyConfirm, `${applyDate}T${new Date().toTimeString().slice(0, 5)}`);
                setApplyConfirm(null);
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
  const { templates, addTemplate, updateTemplate, removeTemplate } = useTemplates();
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
    const validEntries = entries.filter(e => e.amount > 0);
    if (validEntries.length === 0) { showToast('Add at least one entry with an amount', 'error'); return; }

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
            templates.map(t => (
              <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-[10px] text-gray-400">{t.entries.length} entries · {formatCurrency(t.entries.reduce((s, e) => s + e.amount, 0))}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-blue-500 text-sm">✏️</button>
                    <button onClick={() => setDeleteConfirm(t.id)} className="text-gray-400 hover:text-red-500 text-sm">🗑️</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {t.entries.map((e, i) => {
                    const cat = categories.find(c => c.id === e.categoryId);
                    const acc = accounts.find(a => a.id === e.accountId);
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
            ))
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
                      className={inputClass}
                      inputMode="decimal"
                    />
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
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
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
            disabled={!templateName.trim() || entries.filter(e => e.amount > 0).length === 0}
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
