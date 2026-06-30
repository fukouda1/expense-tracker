import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AmountInput from '../components/AmountInput';
import { formatCurrency, formatDate } from '../utils/formatters';
import { saveCsv } from '../utils/saveFile';
import type { Transaction, EntrustedFund } from '../types';

const ENTRUSTED_IN = 'Entrusted Funds';    // income  — a contribution received
const ENTRUSTED_OUT = 'Entrusted Spend';   // expense — money spent on the shared purpose
const ENTRUSTED_RETURN = 'Entrusted Return'; // expense — money given back to a contributor

/** First line of notes = contributor name (same convention as Debt Tracker). */
function contributorOf(t: Transaction): string {
  return (t.notes?.split('\n')[0] ?? '').trim() || 'Unknown';
}
function extraNoteOf(t: Transaction): string {
  return (t.notes ?? '').split('\n').slice(1).join(' ').trim();
}

const inputClass = 'w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white';

type EntryKind = 'contribution' | 'spend' | 'return';

interface FundStat {
  received: number;
  spent: number;
  returned: number;
  contributions: Transaction[];
  spending: Transaction[];
  returns: Transaction[];
}
const emptyStat = (): FundStat => ({ received: 0, spent: 0, returned: 0, contributions: [], spending: [], returns: [] });

/** Classify an entrusted transaction by its category. */
function kindOfTx(t: Transaction): EntryKind {
  if (t.category_name === ENTRUSTED_RETURN) return 'return';
  if (t.category_name === ENTRUSTED_IN || t.type === 'income') return 'contribution';
  return 'spend';
}

export default function EntrustedFund() {
  const navigate = useNavigate();
  const {
    entrustedFunds, categories, accounts,
    addEntrustedFund, editEntrustedFund, removeEntrustedFund,
    getEntrustedTransactions, addTransaction, editTransaction, removeTransaction, addCategory,
  } = useData();
  const { showToast } = useToast();

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  // Month filter for the per-fund contribution roster (YYYY-MM). Defaults to current month.
  const [rosterMonth, setRosterMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  // In-progress "add member" text, keyed by fund id.
  const [memberDraft, setMemberDraft] = useState<Record<number, string>>({});
  // Member currently being renamed + its draft text.
  const [renameTarget, setRenameTarget] = useState<{ fundId: number; oldName: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  /** Add a contributor name to a fund's roster (no transaction). */
  const addMember = async (f: EntrustedFund, rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    if (f.members.some(m => m.toLowerCase() === name.toLowerCase())) {
      showToast(`${name} is already a member`, 'info');
      return;
    }
    try {
      await editEntrustedFund(f.id, { members: [...f.members, name] });
      setMemberDraft(d => ({ ...d, [f.id]: '' }));
    } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to add member', 'error'); }
  };
  /** Remove a member — blocked if they have any contribution/return on record. */
  const removeMember = async (f: EntrustedFund, name: string, hasContribs: boolean) => {
    if (hasContribs) { showToast(`${name} has contributions — cannot remove`, 'error'); return; }
    try {
      await editEntrustedFund(f.id, { members: f.members.filter(m => m !== name) });
    } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to remove member', 'error'); }
  };
  /** Rename a member; also rewrites the first line of all their contribution/return notes. */
  const renameMember = async (f: EntrustedFund, oldName: string, rawNew: string) => {
    const newName = rawNew.trim();
    if (!newName || newName === oldName) { setRenameTarget(null); return; }
    if (f.members.some(m => m.toLowerCase() === newName.toLowerCase() && m.toLowerCase() !== oldName.toLowerCase())) {
      showToast(`${newName} already exists`, 'error'); return;
    }
    try {
      const newMembers = f.members.includes(oldName)
        ? f.members.map(m => (m === oldName ? newName : m))
        : [...f.members, newName];
      await editEntrustedFund(f.id, { members: newMembers });
      // Carry the rename into their existing contribution/return transactions.
      const affected = txs.filter(t => t.entrusted_fund_id === f.id && kindOfTx(t) !== 'spend' && contributorOf(t) === oldName);
      for (const t of affected) {
        const extra = extraNoteOf(t);
        await editTransaction({ ...t, notes: extra ? `${newName}\n${extra}` : newName }, []);
      }
      setRenameTarget(null);
      reload();
      showToast(`Renamed to ${newName}`, 'success');
    } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to rename member', 'error'); }
  };

  const activeAccounts = accounts.filter(a => a.active !== false);
  const inCat = categories.find(c => c.name === ENTRUSTED_IN);
  const outCat = categories.find(c => c.name === ENTRUSTED_OUT);
  const returnCat = categories.find(c => c.name === ENTRUSTED_RETURN);

  const reload = useCallback(() => {
    getEntrustedTransactions().then(setTxs).catch(() => {});
  }, [getEntrustedTransactions]);
  useEffect(() => { reload(); }, [reload]);

  // Ensure the three protected categories exist (older installs / imported data won't have them).
  const [ensuring, setEnsuring] = useState(false);
  useEffect(() => {
    if (categories.length === 0 || ensuring) return;
    const missing: Array<[string, string, string, string]> = [];
    if (!categories.some(c => c.name === ENTRUSTED_IN)) missing.push([ENTRUSTED_IN, '🤝', '#0d9488', 'income']);
    if (!categories.some(c => c.name === ENTRUSTED_OUT)) missing.push([ENTRUSTED_OUT, '🤝', '#dc2626', 'expense']);
    if (!categories.some(c => c.name === ENTRUSTED_RETURN)) missing.push([ENTRUSTED_RETURN, '↩️', '#f59e0b', 'expense']);
    if (missing.length === 0) return;
    setEnsuring(true);
    (async () => {
      try { for (const [n, i, c, t] of missing) await addCategory(n, i, c, t); }
      catch { /* ignore — retry next mount */ }
      finally { setEnsuring(false); }
    })();
  }, [categories, ensuring, addCategory]);

  // ── Fund modal (new / edit) ──
  const [fundModal, setFundModal] = useState<{ mode: 'new' | 'edit'; fund?: EntrustedFund } | null>(null);
  const [fName, setFName] = useState('');
  const [fTarget, setFTarget] = useState('');
  const [fNotes, setFNotes] = useState('');

  const openNewFund = () => { setFundModal({ mode: 'new' }); setFName(''); setFTarget(''); setFNotes(''); };
  const openEditFund = (f: EntrustedFund) => {
    setFundModal({ mode: 'edit', fund: f });
    setFName(f.name); setFTarget(f.target_amount ? String(f.target_amount) : ''); setFNotes(f.notes);
  };
  const saveFund = async () => {
    if (!fName.trim()) { showToast('Fund name is required', 'error'); return; }
    const target = fTarget === '' ? 0 : Number(fTarget);
    try {
      if (fundModal?.mode === 'edit' && fundModal.fund) {
        await editEntrustedFund(fundModal.fund.id, { name: fName.trim(), target_amount: target, notes: fNotes });
        showToast('Fund updated', 'success');
      } else {
        await addEntrustedFund(fName.trim(), target, fNotes);
        showToast('Fund created', 'success');
      }
      setFundModal(null);
    } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to save fund', 'error'); }
  };

  // ── Per-fund aggregates ──
  const fundStats = useMemo(() => {
    const map = new Map<number, FundStat>();
    for (const f of entrustedFunds) map.set(f.id, emptyStat());
    for (const t of txs) {
      if (t.entrusted_fund_id == null) continue;
      const s = map.get(t.entrusted_fund_id);
      if (!s) continue;
      const k = kindOfTx(t);
      if (k === 'contribution') { s.received += t.amount; s.contributions.push(t); }
      else if (k === 'return') { s.returned += t.amount; s.returns.push(t); }
      else { s.spent += t.amount; s.spending.push(t); }
    }
    return map;
  }, [entrustedFunds, txs]);

  const totals = useMemo(() => {
    let received = 0, spent = 0, returned = 0;
    for (const s of fundStats.values()) { received += s.received; spent += s.spent; returned += s.returned; }
    return { received, spent, returned, remaining: received - spent - returned };
  }, [fundStats]);

  /** Per-contributor net: contributed minus returned. */
  const contributorBreakdown = (s: FundStat) => {
    const m = new Map<string, { contributed: number; returned: number }>();
    for (const t of s.contributions) {
      const n = contributorOf(t);
      const e = m.get(n) ?? { contributed: 0, returned: 0 };
      e.contributed += t.amount; m.set(n, e);
    }
    for (const t of s.returns) {
      const n = contributorOf(t);
      const e = m.get(n) ?? { contributed: 0, returned: 0 };
      e.returned += t.amount; m.set(n, e);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, net: v.contributed - v.returned }))
      .sort((a, b) => b.net - a.net);
  };

  /**
   * Monthly contribution roster for a fund: every known contributor (across the
   * fund's full history) and how much they put in during `month` (YYYY-MM).
   * `contributed === 0` → they have NOT contributed for that month.
   */
  const monthlyRoster = (s: FundStat, month: string, members: string[] = []) => {
    // Roster = registered members ∪ anyone who has ever contributed.
    const everyone = Array.from(new Set([...members, ...s.contributions.map(contributorOf)]))
      .sort((a, b) => a.localeCompare(b));
    const inMonth = new Map<string, number>();
    for (const t of s.contributions) {
      if (t.date.slice(0, 7) !== month) continue;
      const n = contributorOf(t);
      inMonth.set(n, (inMonth.get(n) ?? 0) + t.amount);
    }
    return everyone.map(name => ({ name, amount: inMonth.get(name) ?? 0, contributed: inMonth.has(name) }));
  };

  const exportMonthlyReport = async (f: EntrustedFund, s: FundStat, month: string) => {
    const roster = monthlyRoster(s, month, f.members);
    const monthTotal = roster.reduce((sum, r) => sum + r.amount, 0);
    const esc = (v: string | number) => {
      const str = String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines: string[] = [];
    lines.push(`Entrusted Fund Report,${esc(f.name)}`);
    lines.push(`Month,${month}`);
    lines.push('');
    lines.push('Contributor,Status,Amount This Month');
    for (const r of roster) {
      lines.push([esc(r.name), r.contributed ? 'Contributed' : 'No contribution', r.amount].join(','));
    }
    lines.push('');
    lines.push(`Total contributed this month,,${monthTotal}`);
    lines.push(`Contributors who paid,,${roster.filter(r => r.contributed).length} of ${roster.length}`);
    const fileName = `${f.name.replace(/[^\w-]+/g, '_')}_${month}.csv`;
    const ok = await saveCsv(lines.join('\n'), fileName);
    showToast(ok ? `Report saved: ${fileName}` : 'Failed to save report', ok ? 'success' : 'error');
  };

  /** Human label for the roster month, e.g. "June 2026". */
  const monthLabel = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // ── Entry modal (contribution / spend / return / edit) ──
  const [entryModal, setEntryModal] = useState<
    | { kind: EntryKind; fundId: number }
    | { kind: 'edit'; tx: Transaction }
    | null
  >(null);
  const [eAmount, setEAmount] = useState('');
  const [eContributor, setEContributor] = useState('');
  // New-contribution multi-select: record the same amount for several contributors at once.
  const [eMultiContributors, setEMultiContributors] = useState<string[]>([]);
  const [eAccountId, setEAccountId] = useState<number>(activeAccounts[0]?.id ?? 1);
  const [eDate, setEDate] = useState(new Date().toISOString().slice(0, 10));
  const [eNotes, setENotes] = useState('');
  const [saving, setSaving] = useState(false);

  const openEntry = (kind: EntryKind, fundId: number) => {
    setEntryModal({ kind, fundId });
    setEAmount(''); setEContributor(''); setEMultiContributors([]); setEAccountId(activeAccounts[0]?.id ?? 1);
    setEDate(new Date().toISOString().slice(0, 10)); setENotes('');
  };
  const openEditEntry = (tx: Transaction) => {
    setEntryModal({ kind: 'edit', tx });
    const k = kindOfTx(tx);
    setEAmount(String(tx.amount));
    setEContributor(k === 'spend' ? '' : contributorOf(tx));
    setEAccountId(tx.account_id);
    setEDate(tx.date.slice(0, 10));
    setENotes(k === 'spend' ? (tx.notes ?? '') : extraNoteOf(tx));
  };

  // Resolve the effective kind of the open entry modal.
  const modalKind: EntryKind | null = entryModal
    ? (entryModal.kind === 'edit' ? kindOfTx(entryModal.tx) : entryModal.kind)
    : null;
  const needsContributor = modalKind === 'contribution' || modalKind === 'return';
  // Contributor suggestions for the active fund (used by the return picker / datalist).
  const modalFundId = entryModal ? (entryModal.kind === 'edit' ? entryModal.tx.entrusted_fund_id ?? 0 : entryModal.fundId) : 0;
  const modalContributorNames = useMemo(() => {
    const s = fundStats.get(modalFundId);
    const fundMembers = entrustedFunds.find(f => f.id === modalFundId)?.members ?? [];
    const fromContribs = s ? s.contributions.map(contributorOf) : [];
    return Array.from(new Set([...fundMembers, ...fromContribs]));
  }, [fundStats, modalFundId, entrustedFunds]);

  // Only NEW contributions support batching across multiple contributors.
  const isMultiContribution = entryModal?.kind === 'contribution';
  const toggleMultiContributor = (name: string) =>
    setEMultiContributors(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  const addTypedContributor = () => {
    const name = eContributor.trim();
    if (!name) return;
    if (!eMultiContributors.some(n => n.toLowerCase() === name.toLowerCase())) {
      setEMultiContributors(prev => [...prev, name]);
    }
    setEContributor('');
  };

  const saveEntry = async () => {
    if (!entryModal || !modalKind) return;
    const amount = parseFloat(eAmount);
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

    const fallbackTime = new Date().toTimeString().slice(0, 5);

    // ── Batch contribution: same amount for several selected contributors ──
    if (isMultiContribution && entryModal.kind === 'contribution') {
      // Combine selected chips with any name still typed in the box.
      const names = [...eMultiContributors];
      const typed = eContributor.trim();
      if (typed && !names.some(n => n.toLowerCase() === typed.toLowerCase())) names.push(typed);
      if (names.length === 0) { showToast('Select at least one contributor', 'error'); return; }
      if (!inCat) { showToast('Entrusted categories missing — reopen the page to create them', 'error'); return; }

      setSaving(true);
      try {
        const fund = entrustedFunds.find(f => f.id === entryModal.fundId);
        const newMembers = fund ? [...fund.members] : [];
        let ok = 0; const failed: string[] = [];
        for (const name of names) {
          const notes = eNotes.trim() ? `${name}\n${eNotes.trim()}` : name;
          try {
            await addTransaction({
              amount, type: 'income', category_id: inCat.id, account_id: eAccountId,
              to_account_id: null, date: `${eDate}T${fallbackTime}`, notes,
              entrusted_fund_id: entryModal.fundId,
            } as Omit<Transaction, 'id' | 'created_at'>, []);
            ok++;
            if (!newMembers.some(m => m.toLowerCase() === name.toLowerCase())) newMembers.push(name);
          } catch (e: any) {
            failed.push(name);
          }
        }
        // Auto-merge every successful contributor into the fund roster.
        if (fund && newMembers.length !== fund.members.length) {
          await editEntrustedFund(fund.id, { members: newMembers });
        }
        if (ok > 0) showToast(
          `Recorded ${ok} contribution${ok !== 1 ? 's' : ''}${failed.length ? ` · ${failed.length} skipped (duplicate)` : ''}`,
          failed.length ? 'info' : 'success',
        );
        else showToast(`No contributions saved — ${failed.length} duplicate(s)`, 'error');
        setEntryModal(null);
        reload();
      } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to save', 'error'); }
      finally { setSaving(false); }
      return;
    }

    if (needsContributor && !eContributor.trim()) { showToast('Contributor name is required', 'error'); return; }

    const notes = needsContributor
      ? (eNotes.trim() ? `${eContributor.trim()}\n${eNotes.trim()}` : eContributor.trim())
      : eNotes.trim();

    setSaving(true);
    try {
      if (entryModal.kind === 'edit') {
        const time = entryModal.tx.date.slice(11, 16) || fallbackTime;
        await editTransaction({ ...entryModal.tx, amount, account_id: eAccountId, date: `${eDate}T${time}`, notes }, []);
        showToast('Entry updated', 'success');
      } else {
        const cat = modalKind === 'contribution' ? inCat : modalKind === 'return' ? returnCat : outCat;
        if (!cat) { showToast('Entrusted categories missing — reopen the page to create them', 'error'); setSaving(false); return; }
        await addTransaction({
          amount,
          type: modalKind === 'contribution' ? 'income' : 'expense',
          category_id: cat.id,
          account_id: eAccountId,
          to_account_id: null,
          date: `${eDate}T${fallbackTime}`,
          notes,
          entrusted_fund_id: entryModal.fundId,
        } as Omit<Transaction, 'id' | 'created_at'>, []);
        showToast(
          modalKind === 'contribution' ? 'Contribution recorded'
            : modalKind === 'return' ? 'Return recorded' : 'Spending recorded',
          'success',
        );
      }
      // Auto-merge: a contribution/return contributor becomes a fund member so the
      // Members list and the contributor names stay one unified roster.
      if (needsContributor) {
        const fundId = entryModal.kind === 'edit' ? entryModal.tx.entrusted_fund_id : entryModal.fundId;
        const fund = entrustedFunds.find(f => f.id === fundId);
        const cname = eContributor.trim();
        if (fund && cname && !fund.members.some(m => m.toLowerCase() === cname.toLowerCase())) {
          await editEntrustedFund(fund.id, { members: [...fund.members, cname] });
        }
      }
      setEntryModal(null);
      reload();
    } catch (e: any) { showToast(e?.response?.data?.error || e?.message || 'Failed to save entry', 'error'); }
    finally { setSaving(false); }
  };

  // ── Delete confirms ──
  const [deleteFund, setDeleteFund] = useState<EntrustedFund | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<Transaction | null>(null);

  const confirmDeleteFund = async () => {
    if (!deleteFund) return;
    const f = deleteFund;
    setDeleteFund(null);
    try { await removeEntrustedFund(f.id); showToast('Fund deleted', 'success'); }
    catch (e: any) { showToast(e?.message || 'Cannot delete fund', 'error'); }
  };
  const confirmDeleteEntry = async () => {
    if (!deleteEntry) return;
    const id = deleteEntry.id;
    setDeleteEntry(null);
    try { await removeTransaction(id); showToast('Entry deleted', 'success'); reload(); }
    catch { showToast('Failed to delete entry', 'error'); }
  };

  const modalTitle = entryModal
    ? (entryModal.kind === 'edit' ? 'Edit Entry'
      : entryModal.kind === 'spend' ? 'Add Spending'
      : entryModal.kind === 'return' ? 'Return to Contributor'
      : 'Add Contribution')
    : '';

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900 px-4 pt-4 space-y-3 safe-top pb-safe">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Entrusted Funds</h1>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Money other people entrust to you for shared plans. Not counted as your income.
      </p>

      {/* Overall summary */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Received', value: totals.received, cls: 'bg-teal-600' },
          { label: 'Spent', value: totals.spent, cls: 'bg-red-500' },
          { label: 'Returned', value: totals.returned, cls: 'bg-amber-500' },
          { label: 'Remaining', value: totals.remaining, cls: 'bg-gray-800 dark:bg-gray-700' },
        ].map(s => (
          <div key={s.label} className={`${s.cls} rounded-xl p-2 text-center`}>
            <p className="text-[8px] text-white/80 uppercase font-semibold tracking-wider">{s.label}</p>
            <p className="text-[11px] font-bold text-white mt-0.5">{formatCurrency(s.value)}</p>
          </div>
        ))}
      </div>

      <button onClick={openNewFund} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
        + New Fund
      </button>

      {/* Fund list */}
      {entrustedFunds.length === 0 ? (
        <div className="text-center text-gray-400 py-10 text-sm">
          <p className="text-2xl mb-2">🤝</p>
          <p>No entrusted funds yet</p>
          <p className="text-[10px] mt-1">Create one for money you're holding on behalf of others</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entrustedFunds.map(f => {
            const s = fundStats.get(f.id) ?? emptyStat();
            const remaining = s.received - s.spent - s.returned;
            const pct = f.target_amount > 0 ? Math.min(100, (s.received / f.target_amount) * 100) : 0;
            const isOpen = expanded === f.id;
            return (
              <div key={f.id} className={`bg-white dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden ${f.closed ? 'opacity-60' : ''}`}>
                <button onClick={() => setExpanded(isOpen ? null : f.id)} className="w-full p-3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{f.name}</p>
                      {f.closed && <span className="text-[9px] bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5 flex-shrink-0">Closed</span>}
                    </div>
                    <span className={`text-[10px] flex-shrink-0 ${isOpen ? 'rotate-180' : ''} transition-transform text-gray-400`}>▼</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                    <span className="text-teal-600 dark:text-teal-400">In {formatCurrency(s.received)}</span>
                    <span className="text-red-500">Out {formatCurrency(s.spent + s.returned)}</span>
                    <span className="font-semibold text-gray-900 dark:text-white ml-auto">Left {formatCurrency(remaining)}</span>
                  </div>
                  {f.target_amount > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[9px] text-gray-400 mt-0.5">
                        {formatCurrency(s.received)} of {formatCurrency(f.target_amount)} target ({pct.toFixed(0)}%)
                      </p>
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2.5 space-y-3">
                    {/* Actions */}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => openEntry('contribution', f.id)}
                        className="py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-medium">
                        + Contribution
                      </button>
                      <button onClick={() => openEntry('spend', f.id)}
                        className="py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[11px] font-medium">
                        + Spending
                      </button>
                      <button onClick={() => openEntry('return', f.id)}
                        className="py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-medium">
                        + Return
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEditFund(f)}
                        className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-lg text-[11px]">✏️ Edit fund</button>
                      <button onClick={() => editEntrustedFund(f.id, { closed: !f.closed }).then(() => showToast(f.closed ? 'Reopened' : 'Closed', 'success'))}
                        className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-lg text-[11px]">
                        {f.closed ? '↺ Reopen' : '🗄️ Close'}
                      </button>
                      <button onClick={() => setDeleteFund(f)}
                        className="py-1.5 px-2.5 bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-red-500 rounded-lg text-[11px]">🗑️</button>
                    </div>

                    {f.notes && <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">{f.notes}</p>}

                    {/* Members — register expected contributors (no amount). They appear
                        as ⏳ pending in the roster until they actually contribute. */}
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Members</p>
                      {f.members.length > 0 && (() => {
                        // Members who have at least one contribution/return on record
                        // (case-insensitive) can be renamed but not deleted.
                        const withContribs = new Set(
                          [...s.contributions, ...s.returns].map(t => contributorOf(t).toLowerCase())
                        );
                        return (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {f.members.map(m => {
                            const isRenaming = renameTarget?.fundId === f.id && renameTarget.oldName === m;
                            const hasContribs = withContribs.has(m.toLowerCase());
                            if (isRenaming) {
                              return (
                                <span key={m} className="inline-flex items-center gap-1">
                                  <input
                                    autoFocus
                                    value={renameDraft}
                                    onChange={e => setRenameDraft(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') renameMember(f, m, renameDraft);
                                      if (e.key === 'Escape') setRenameTarget(null);
                                    }}
                                    className="w-24 px-2 py-1 rounded-full text-[11px] bg-white dark:bg-gray-700 border border-teal-400 text-gray-900 dark:text-white"
                                  />
                                  <button onClick={() => renameMember(f, m, renameDraft)} className="text-teal-600 dark:text-teal-400 text-[11px]" title="Save">✓</button>
                                  <button onClick={() => setRenameTarget(null)} className="text-gray-400 text-[11px]" title="Cancel">×</button>
                                </span>
                              );
                            }
                            return (
                              <span key={m} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                {m}
                                <button onClick={() => { setRenameTarget({ fundId: f.id, oldName: m }); setRenameDraft(m); }}
                                  className="text-gray-400 hover:text-blue-500 leading-none" title={`Rename ${m}`}>✏️</button>
                                {!hasContribs && (
                                  <button onClick={() => removeMember(f, m, hasContribs)} className="text-gray-400 hover:text-red-500 leading-none" title={`Remove ${m}`}>×</button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        );
                      })()}
                      <div className="flex gap-1.5">
                        <input
                          value={memberDraft[f.id] ?? ''}
                          onChange={e => setMemberDraft(d => ({ ...d, [f.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') addMember(f, memberDraft[f.id] ?? ''); }}
                          placeholder="Add a contributor name"
                          className="flex-1 p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] text-gray-900 dark:text-white"
                        />
                        <button onClick={() => addMember(f, memberDraft[f.id] ?? '')}
                          className="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-medium hover:bg-teal-100 dark:hover:bg-teal-900/40">
                          + Member
                        </button>
                      </div>
                    </div>

                    {/* Monthly contribution roster — who has / hasn't paid this month */}
                    {(() => {
                      const roster = monthlyRoster(s, rosterMonth, f.members);
                      const paid = roster.filter(r => r.contributed);
                      const pending = roster.filter(r => !r.contributed);
                      const monthTotal = roster.reduce((sum, r) => sum + r.amount, 0);
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Monthly Roster</p>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="month"
                                value={rosterMonth}
                                onChange={e => setRosterMonth(e.target.value)}
                                className="text-[10px] bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-gray-700 dark:text-gray-200"
                              />
                              <button
                                onClick={() => exportMonthlyReport(f, s, rosterMonth)}
                                className="text-[10px] px-2 py-0.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-medium"
                                title="Export this month's roster as CSV"
                              >
                                ⬇ Report
                              </button>
                            </div>
                          </div>
                          {roster.length === 0 ? (
                            <p className="text-[11px] text-gray-400">No contributors recorded yet</p>
                          ) : (
                            <>
                              <p className="text-[10px] text-gray-400 mb-1">
                                {monthLabel(rosterMonth)} · {paid.length}/{roster.length} paid · {formatCurrency(monthTotal)}
                              </p>
                              <div className="space-y-1">
                                {paid.map(r => (
                                  <div key={r.name} className="flex items-center justify-between text-[11px] bg-teal-50 dark:bg-teal-900/20 rounded-lg px-2 py-1.5">
                                    <span className="text-gray-700 dark:text-gray-300">✅ {r.name}</span>
                                    <span className="font-semibold text-teal-600 dark:text-teal-400">{formatCurrency(r.amount)}</span>
                                  </div>
                                ))}
                                {pending.map(r => (
                                  <div key={r.name} className="flex items-center justify-between text-[11px] bg-gray-50 dark:bg-gray-700/40 rounded-lg px-2 py-1.5">
                                    <span className="text-gray-500 dark:text-gray-400">⏳ {r.name}</span>
                                    <span className="text-[10px] text-amber-500 font-medium">No contribution</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Contributors (net of returns) */}
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Contributors</p>
                      {s.contributions.length === 0 ? (
                        <p className="text-[11px] text-gray-400">No contributions yet</p>
                      ) : (
                        <div className="space-y-1">
                          {contributorBreakdown(s).map(c => (
                            <div key={c.name} className="flex items-center justify-between text-[11px] bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2 py-1.5">
                              <span className="text-gray-700 dark:text-gray-300">
                                {c.name}
                                {c.returned > 0 && (
                                  <span className="text-gray-400 italic"> · gave {formatCurrency(c.contributed)}, returned {formatCurrency(c.returned)}</span>
                                )}
                              </span>
                              <span className="font-semibold text-teal-600 dark:text-teal-400">{formatCurrency(c.net)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Entry log */}
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Entries</p>
                      {[...s.contributions, ...s.spending, ...s.returns].sort((a, b) => b.date.localeCompare(a.date)).map(t => {
                        const k = kindOfTx(t);
                        const isIn = k === 'contribution';
                        const extra = k === 'spend' ? (t.notes ?? '') : extraNoteOf(t);
                        const label = k === 'contribution' ? contributorOf(t)
                          : k === 'return' ? `Return → ${contributorOf(t)}` : 'Spending';
                        const color = k === 'contribution' ? 'text-teal-600 dark:text-teal-400'
                          : k === 'return' ? 'text-amber-600 dark:text-amber-400' : 'text-red-500';
                        const dot = k === 'contribution' ? 'bg-teal-500' : k === 'return' ? 'bg-amber-500' : 'bg-red-500';
                        return (
                          <div key={t.id} className="flex items-center gap-2 text-[11px] py-1">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                            <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{formatDate(t.date)}</span>
                            <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                              {label}
                              {extra && <span className="text-gray-400 italic"> · {extra}</span>}
                            </span>
                            <span className={`font-medium flex-shrink-0 ${color}`}>
                              {isIn ? '+' : '-'}{formatCurrency(t.amount)}
                            </span>
                            <button onClick={() => openEditEntry(t)} className="text-gray-400 hover:text-blue-500 flex-shrink-0">✏️</button>
                            <button onClick={() => setDeleteEntry(t)} className="text-gray-400 hover:text-red-500 flex-shrink-0">🗑️</button>
                          </div>
                        );
                      })}
                      {s.contributions.length + s.spending.length + s.returns.length === 0 && (
                        <p className="text-[11px] text-gray-400">No entries yet</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fund modal */}
      <Modal open={!!fundModal} onClose={() => setFundModal(null)} title={fundModal?.mode === 'edit' ? 'Edit Fund' : 'New Entrusted Fund'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Fund name</label>
            <input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Japan Trip" className={inputClass} autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Target amount (optional)</label>
            <AmountInput value={fTarget} onChange={setFTarget} placeholder="0 = no target" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes (optional)</label>
            <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} className={inputClass + ' resize-none'} />
          </div>
          <button onClick={saveFund} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>

      {/* Entry modal */}
      <Modal open={!!entryModal} onClose={() => setEntryModal(null)} title={modalTitle}>
        <div className="space-y-3">
          {needsContributor && isMultiContribution && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                Contributors {eMultiContributors.length > 0 && <span className="text-teal-600 dark:text-teal-400">· {eMultiContributors.length} selected</span>}
              </label>
              <p className="text-[10px] text-gray-400 mb-1.5">Tap names to select multiple — the amount below applies to each.</p>
              {modalContributorNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {modalContributorNames.map(n => {
                    const selected = eMultiContributors.some(m => m.toLowerCase() === n.toLowerCase());
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleMultiContributor(n)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                          selected
                            ? 'bg-teal-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-teal-900/40'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{n}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Chips for typed-in names not in the suggestion list */}
              {eMultiContributors.filter(n => !modalContributorNames.some(m => m.toLowerCase() === n.toLowerCase())).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {eMultiContributors.filter(n => !modalContributorNames.some(m => m.toLowerCase() === n.toLowerCase())).map(n => (
                    <span key={n} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-teal-600 text-white">
                      ✓ {n}
                      <button onClick={() => toggleMultiContributor(n)} className="leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input value={eContributor} onChange={e => setEContributor(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTypedContributor(); } }}
                  placeholder="Add another name" className={inputClass} />
                <button type="button" onClick={addTypedContributor}
                  className="px-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-medium">+ Add</button>
              </div>
            </div>
          )}
          {needsContributor && !isMultiContribution && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                {modalKind === 'return' ? 'Return to (contributor)' : 'Contributor name'}
              </label>
              <input value={eContributor} onChange={e => setEContributor(e.target.value)}
                placeholder="Type a name or pick below" className={inputClass} />
              {modalContributorNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {modalContributorNames.map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEContributor(n)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        eContributor.trim() === n
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-teal-900/40'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Amount</label>
            <AmountInput value={eAmount} onChange={setEAmount} placeholder="0.00" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
              {modalKind === 'contribution' ? 'Received into account' : 'Paid from account'}
            </label>
            <select value={eAccountId} onChange={e => setEAccountId(Number(e.target.value))} className={inputClass}>
              {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date</label>
            <input type="date" value={eDate} onChange={e => setEDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes (optional)</label>
            <textarea value={eNotes} onChange={e => setENotes(e.target.value)} rows={2}
              placeholder={modalKind === 'spend' ? 'e.g. plane tickets' : 'e.g. via GCash'} className={inputClass + ' resize-none'} />
          </div>
          <button onClick={saveEntry} disabled={saving}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteFund}
        onClose={() => setDeleteFund(null)}
        onConfirm={confirmDeleteFund}
        title="Delete Fund"
        message={`Delete "${deleteFund?.name}"? Funds with recorded entries cannot be deleted — close it instead.`}
        confirmText="Delete"
        variant="danger"
      />
      <ConfirmDialog
        open={!!deleteEntry}
        onClose={() => setDeleteEntry(null)}
        onConfirm={confirmDeleteEntry}
        title="Delete Entry"
        message="Delete this entry? This removes the transaction permanently."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
