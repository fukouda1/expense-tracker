import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import TransactionCard from '../components/TransactionCard';
import BudgetProgress from '../components/BudgetProgress';
import { TemplateManager } from '../components/QuickTemplates';
import AutoBackupToggle from '../components/AutoBackup';
import { PinLockSettings } from '../components/PinLock';
import { getCurrentMonth, formatMonth, formatCurrency } from '../utils/formatters';
import { post } from '../services/api';
import MonthPicker from '../components/MonthPicker';
import * as repo from '../local/repository';
import type { Category, Account, Budget, Transaction, RecurringTransaction, RecurrenceType, TransactionType } from '../types';

interface ImportPreview {
  fileName: string;
  fileType: 'csv' | 'xlsx';
  csvRows?: string[][];
  totalLines?: number;
  sheets?: { name: string; rowCount: number }[];
  summary: string;
}

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { dark, toggle } = useTheme();
  const {
    categories, accounts, tags, budgets, recurring,
    addCategory, editCategory, removeCategory, getTransactionsByDate,
    addAccount, editAccount, removeAccount,
    addTag, removeTag,
    toggleAccountActive, toggleCategoryActive, toggleTagActive,
    reorderAccounts, reorderCategories, reorderTags,
    loadBudgets, saveBudget, editBudget, removeBudget,
    loadRecurring, addRecurring, editRecurring, removeRecurring,
    exportCsv, refresh,
  } = useData();

  const validTabs = ['general', 'categories', 'accounts', 'tags', 'budgets', 'recurring', 'templates'] as const;
  type TabKey = typeof validTabs[number];
  const initialTab = (validTabs.includes(searchParams.get('tab') as TabKey) ? searchParams.get('tab') : 'general') as TabKey;
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [pdfMonth, setPdfMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Move item up/down in a list and save new order
  const moveItem = async <T extends { id: number }>(items: T[], index: number, dir: -1 | 1, reorderFn: (ids: number[]) => Promise<void>) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= items.length) return;
    const ids = items.map(i => i.id);
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    await reorderFn(ids);
  };

  // Load ALL transactions when categories tab is opened (not period-filtered)
  useEffect(() => {
    if (activeTab === 'categories') {
      getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59').then(setAllTransactions);
    }
    if (activeTab === 'budgets') loadBudgets(budgetMonth);
    if (activeTab === 'recurring') loadRecurring();
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
  const [tagCategoryId, setTagCategoryId] = useState<number | ''>('');

  // Budget form
  const [budgetMonth, setBudgetMonth] = useState(getCurrentMonth());
  const [budgetCatId, setBudgetCatId] = useState<number | ''>('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [editBudgetId, setEditBudgetId] = useState<number | null>(null);

  // Recurring form
  const [recAmount, setRecAmount] = useState('');
  const [recType, setRecType] = useState<TransactionType>('expense');
  const [recCatId, setRecCatId] = useState<number | ''>('');
  const [recAccId, setRecAccId] = useState<number | ''>('');
  const [recNotes, setRecNotes] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('monthly');
  const [recNextDate, setRecNextDate] = useState(new Date().toISOString().slice(0, 10));
  const [editRecId, setEditRecId] = useState<number | null>(null);

  // CSV import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openModal = (type: string) => {
    setModalType(type);
    setShowModal(true);
    // Reset forms
    setCatName(''); setCatIcon('📦'); setCatColor('#6b7280'); setCatType('expense'); setEditCatId(null);
    setAccName(''); setAccIcon('💰'); setAccColor('#10b981'); setAccBalance('0'); setEditAccId(null);
    setTagName(''); setTagColor('#3b82f6'); setTagCategoryId('');
    setBudgetCatId(''); setBudgetAmount(''); setEditBudgetId(null);
    setRecAmount(''); setRecType('expense'); setRecCatId(''); setRecAccId(''); setRecNotes('');
    setRecurrence('monthly'); setRecNextDate(new Date().toISOString().slice(0, 10)); setEditRecId(null);
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) { showToast('Category name is required', 'error'); return; }
    if (!editCatId && categories.some(c => c.name.toLowerCase() === catName.trim().toLowerCase())) {
      showToast(`Category "${catName.trim()}" already exists`, 'error');
      return;
    }
    try {
      if (editCatId) {
        await editCategory(editCatId, catName.trim(), catIcon, catColor, catType);
        showToast('Category updated', 'success');
      } else {
        await addCategory(catName.trim(), catIcon, catColor, catType);
        showToast('Category created', 'success');
      }
      setShowModal(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to save category', 'error');
    }
  };

  const handleEditCat = (c: Category) => {
    setEditCatId(c.id); setCatName(c.name); setCatIcon(c.icon); setCatColor(c.color); setCatType(c.type);
    setModalType('category'); setShowModal(true);
  };

  const handleSaveAccount = async () => {
    if (!accName.trim()) { showToast('Account name is required', 'error'); return; }
    if (!editAccId && accounts.some(a => a.name.toLowerCase() === accName.trim().toLowerCase())) {
      showToast(`Account "${accName.trim()}" already exists`, 'error');
      return;
    }
    try {
      if (editAccId) {
        await editAccount(editAccId, accName.trim(), accIcon, accColor);
        showToast('Account updated', 'success');
      } else {
        await addAccount(accName.trim(), accIcon, accColor, Number(accBalance));
        showToast('Account created', 'success');
      }
      setShowModal(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to save account', 'error');
    }
  };

  const handleEditAcc = (a: Account) => {
    setEditAccId(a.id); setAccName(a.name); setAccIcon(a.icon); setAccColor(a.color);
    setModalType('account'); setShowModal(true);
  };

  const handleSaveTag = async () => {
    if (!tagName.trim()) { showToast('Tag name is required', 'error'); return; }
    if (tags.some(t => t.name.toLowerCase() === tagName.trim().toLowerCase())) {
      showToast(`Tag "${tagName.trim()}" already exists`, 'error');
      return;
    }
    try {
      await addTag(tagName.trim(), tagColor, tagCategoryId || null);
      showToast('Tag created', 'success');
      setShowModal(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to save tag', 'error');
    }
  };

  const handleSaveBudget = async () => {
    if (!budgetAmount || Number(budgetAmount) <= 0) {
      showToast('Budget amount is required', 'error');
      return;
    }
    try {
      if (editBudgetId) {
        await editBudget(editBudgetId, budgetCatId || null, Number(budgetAmount), budgetMonth);
        showToast('Budget updated', 'success');
      } else {
        await saveBudget(budgetCatId || null, Number(budgetAmount), budgetMonth);
        showToast('Budget created', 'success');
      }
      setShowModal(false);
      await loadBudgets(budgetMonth);
    } catch (err: any) {
      showToast(err?.message || 'Failed to save budget', 'error');
    }
  };

  const handleEditBudget = (b: Budget) => {
    setEditBudgetId(b.id);
    setBudgetCatId(b.category_id ?? '');
    setBudgetAmount(String(b.amount));
    setModalType('budget');
    setShowModal(true);
  };

  const handleSaveRecurring = async () => {
    if (!recAccId) {
      showToast('Account is required', 'error');
      return;
    }
    const data = {
      amount: recAmount === '' ? 0 : Number(recAmount),
      type: recType,
      category_id: recCatId || null,
      account_id: recAccId as number,
      notes: recNotes,
      recurrence_type: recurrence,
      next_date: recNextDate,
    };
    try {
      if (editRecId) {
        await editRecurring(editRecId, data);
        showToast('Recurring transaction updated', 'success');
      } else {
        await addRecurring(data);
        showToast('Recurring transaction created', 'success');
      }
      setShowModal(false);
      await loadRecurring();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save recurring transaction', 'error');
    }
  };

  const handleEditRecurring = (r: RecurringTransaction) => {
    setEditRecId(r.id);
    setRecAmount(String(r.amount));
    setRecType(r.type);
    setRecCatId(r.category_id ?? '');
    setRecAccId(r.account_id);
    setRecNotes(r.notes);
    setRecurrence(r.recurrence_type);
    setRecNextDate(r.next_date);
    setModalType('recurring');
    setShowModal(true);
  };

  // Store last exported data so Share can reuse it
  const lastExportRef = useRef<{ base64: string; fileName: string; mimeType: string } | null>(null);

  const lastExportUriRef = useRef<string | null>(null);

  const openLastExport = async () => {
    if (lastExportUriRef.current && lastExportRef.current) {
      try {
        await Share.share({ title: lastExportRef.current.fileName, url: lastExportUriRef.current, dialogTitle: `Open ${lastExportRef.current.fileName}` });
      } catch { /* user cancelled share */ }
    }
  };

  const saveToDownloads = async (base64: string, fileName: string, mimeType: string) => {
    lastExportRef.current = { base64, fileName, mimeType };
    if (Capacitor.isNativePlatform()) {
      // Write to cache (reliable on all Android), show toast with OPEN action
      const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
      lastExportUriRef.current = written.uri;
      showToast(`Exported: ${fileName}`, 'success', {
        onClick: () => openLastExport(),
        actionLabel: 'OPEN',
        duration: 6000,
      });
    } else {
      const byteChars = atob(base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
      showToast(`Downloaded: ${fileName}`, 'success');
    }
  };

  const shareLastExport = async () => {
    if (!lastExportRef.current) { showToast('Export first, then share', 'error'); return; }
    const { base64, fileName } = lastExportRef.current;
    try {
      let uri = lastExportUriRef.current;
      if (!uri) {
        const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
        uri = written.uri;
        lastExportUriRef.current = uri;
      }
      await Share.share({ title: fileName, url: uri, dialogTitle: `Share ${fileName}` });
    } catch (err: any) {
      showToast(`Share failed: ${err?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native: build full multi-sheet XLSX from local SQLite
        const XLSX = await import('xlsx');
        const { utils, write } = XLSX;
        const wb = utils.book_new();

        // Accounts sheet
        const accs = await repo.getAllAccounts();
        utils.book_append_sheet(wb, utils.json_to_sheet(accs.map(a => ({
          ID: a.id, NAME: a.name, ICON: a.icon, COLOR: a.color, INITIAL_BALANCE: a.initial_balance,
        }))), 'Accounts');

        // Categories sheet
        const cats = await repo.getAllCategories();
        utils.book_append_sheet(wb, utils.json_to_sheet(cats.map(c => ({
          ID: c.id, NAME: c.name, ICON: c.icon, COLOR: c.color, TYPE: c.type,
        }))), 'Categories');

        // Tags sheet
        const tgs = await repo.getAllTags();
        utils.book_append_sheet(wb, utils.json_to_sheet(tgs.length ? tgs.map(t => ({
          ID: t.id, NAME: t.name, COLOR: t.color,
        })) : [{ ID: '', NAME: '', COLOR: '' }]), 'Tags');

        // Budgets sheet
        const bdgs = budgets;
        utils.book_append_sheet(wb, utils.json_to_sheet(bdgs.length ? bdgs.map(b => ({
          ID: b.id, CATEGORY: categories.find(c => c.id === b.category_id)?.name ?? '', AMOUNT: b.amount, MONTH: b.month,
        })) : [{ ID: '', CATEGORY: '', AMOUNT: '', MONTH: '' }]), 'Budgets');

        // Recurring sheet
        const recs = recurring;
        utils.book_append_sheet(wb, utils.json_to_sheet(recs.length ? recs.map(r => ({
          ID: r.id, AMOUNT: r.amount, TYPE: r.type, CATEGORY_ID: r.category_id,
          ACCOUNT_ID: r.account_id, NOTES: r.notes, RECURRENCE: r.recurrence_type,
          NEXT_DATE: r.next_date, ACTIVE: r.active ? 'Yes' : 'No',
        })) : [{ ID: '', AMOUNT: '', TYPE: '' }]), 'Recurring');

        // Transactions sheet — structured data matching server format
        const allTx = await repo.getTransactionsByDateRange('2000-01-01', '2099-12-31T23:59:59');
        const txData = allTx.sort((a, b) => a.date.localeCompare(b.date)).map(t => ({
          ID: t.id,
          DATE: t.date,
          TYPE: t.type,
          AMOUNT: t.amount,
          CATEGORY: t.category_name ?? '',
          ACCOUNT: t.account_name ?? '',
          TO_ACCOUNT: t.to_account_name ?? '',
          NOTES: t.notes ?? '',
          TAGS: '',
        }));
        utils.book_append_sheet(wb, utils.json_to_sheet(txData), 'Transactions');

        const wbOut = write(wb, { type: 'base64', bookType: 'xlsx' });
        const fileName = `tracecash_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
        await saveToDownloads(wbOut, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        const response = await fetch('/api/export/xlsx');
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
        }
        const base64 = btoa(binary);
        const fileName = `tracecash_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
        await saveToDownloads(base64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } catch (err: any) {
      showToast(`Export failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const csv = await exportCsv();
      const base64 = btoa(unescape(encodeURIComponent(csv)));
      const fileName = `tracecash_export_${new Date().toISOString().slice(0, 10)}.csv`;
      await saveToDownloads(base64, fileName, 'text/csv');
    } catch (err: any) {
      showToast(`Export failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setExportingCsv(false);
    }
  };

  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const importTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFilePreview = async (file: File) => {
    setImportFile(file);
    setImportResult(null);
    setImportPreview(null);
    setPreviewLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        const rows = lines.map(l => {
          // Simple CSV parse (handles quoted fields)
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (const ch of l) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
            else { current += ch; }
          }
          result.push(current.trim());
          return result;
        });
        // Count data rows (exclude header)
        const dataRows = rows.length > 1 ? rows.length - 1 : 0;
        // Try to detect accounts and categories from columns
        const header = rows[0]?.map(h => h.toLowerCase()) || [];
        const accountIdx = header.findIndex(h => h.includes('account'));
        const categoryIdx = header.findIndex(h => h.includes('category'));
        const uniqueAccounts = accountIdx >= 0
          ? new Set(rows.slice(1).map(r => r[accountIdx]).filter(Boolean)).size : 0;
        const uniqueCategories = categoryIdx >= 0
          ? new Set(rows.slice(1).map(r => r[categoryIdx]).filter(Boolean)).size : 0;

        const parts = [`${dataRows} transactions`];
        if (uniqueAccounts) parts.push(`${uniqueAccounts} accounts`);
        if (uniqueCategories) parts.push(`${uniqueCategories} categories`);

        setImportPreview({
          fileName: file.name,
          fileType: 'csv',
          csvRows: rows.slice(0, 6), // header + first 5 rows
          totalLines: dataRows,
          summary: `This file contains ${parts.join(', ')}`,
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        // For xlsx files, show basic file info (xlsx parsing happens server-side)
        try {
          const sizeMb = (file.size / 1024 / 1024).toFixed(2);
          setImportPreview({
            fileName: file.name,
            fileType: 'xlsx',
            sheets: [],
            summary: `Excel file (${sizeMb} MB) — sheets will be parsed on import. Expected sheets: Accounts, Categories, Tags, Budgets, Recurring, Transactions`,
          });
        } catch {
          // xlsx library not available, show basic info
          setImportPreview({
            fileName: file.name,
            fileType: 'xlsx',
            summary: `Excel file selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
          });
        }
      }
    } catch (err) {
      console.error('Preview failed:', err);
      setImportPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImportCsv = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportProgress(0);
    // Animate progress bar from 0 → 85% while import runs
    let pct = 0;
    importTimerRef.current = setInterval(() => {
      pct = Math.min(pct + (pct < 50 ? 4 : pct < 75 ? 2 : 0.5), 85);
      setImportProgress(pct);
    }, 150);

    const isNative = Capacitor.isNativePlatform();

    try {
      if (isNative) {
        // ── Native mode: import directly into local SQLite ──
        const ext = importFile.name.split('.').pop()?.toLowerCase();

        let data: repo.LocalImportResult;
        if ((ext === 'xlsx' || ext === 'xls')) {
          // Parse Excel on client using SheetJS
          const XLSX = await import('xlsx');
          const buf = await importFile.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          const sheets = new Map<string, Record<string, unknown>[]>();
          for (const name of wb.SheetNames) {
            sheets.set(name, XLSX.utils.sheet_to_json(wb.Sheets[name]) as Record<string, unknown>[]);
          }
          data = await repo.importFromSheets(sheets);
        } else if (ext === 'csv') {
          const text = await importFile.text();
          if (text.includes('[SHEET:')) {
            // Multi-sheet CSV
            const sheets = parseMultiSheetCsvLocal(text);
            data = await repo.importFromSheets(sheets);
          } else {
            // Legacy format
            data = await repo.importLegacyCsv(text);
          }
        } else {
          setImportResult('Error: Unsupported file format. Use .xlsx or .csv');
          if (importTimerRef.current) clearInterval(importTimerRef.current);
          setImporting(false); setImportProgress(0);
          return;
        }

        const parts = [];
        if (data.accounts) parts.push(`${data.accounts} accounts`);
        if (data.categories) parts.push(`${data.categories} categories`);
        if (data.tags) parts.push(`${data.tags} tags`);
        if (data.budgets) parts.push(`${data.budgets} budgets`);
        if (data.recurring) parts.push(`${data.recurring} recurring`);
        if (data.transactions) parts.push(`${data.transactions} transactions`);
        const errDetail = data.errors.length ? `\nErrors: ${data.errors.slice(0, 5).join('; ')}` : '';
        const msg = parts.length ? `Imported: ${parts.join(', ')}` : 'Import completed but no data was imported';
        setImportResult(`${msg}${data.errors.length ? ` (${data.errors.length} errors)` : ''}${errDetail}`);
        // Reload all data from DB
        try { await refresh(); } catch { /* ignore refresh errors */ }
      } else {
        // ── Web mode: upload to server API ──
        const formData = new FormData();
        formData.append('file', importFile);
        const response = await fetch('/api/import/csv', { method: 'POST', body: formData });
        const data = await response.json();
        if (response.ok) {
          if (data.transactions !== undefined) {
            const parts = [];
            if (data.accounts) parts.push(`${data.accounts} accounts`);
            if (data.categories) parts.push(`${data.categories} categories`);
            if (data.tags) parts.push(`${data.tags} tags`);
            if (data.budgets) parts.push(`${data.budgets} budgets`);
            if (data.recurring) parts.push(`${data.recurring} recurring`);
            if (data.transactions) parts.push(`${data.transactions} transactions`);
            setImportResult(`Imported: ${parts.join(', ')}${data.errors?.length ? ` (${data.errors.length} errors)` : ''}`);
          } else {
            setImportResult(`Imported ${data.imported} transactions, ${data.skipped} skipped${data.errors?.length ? `, ${data.errors.length} errors` : ''}`);
          }
          await refresh();
        } else {
          setImportResult(`Error: ${data.error || 'Import failed'}`);
        }
      }
    } catch (err: any) {
      setImportResult(`Error: ${err?.message || 'Import failed'}`);
      console.error('Import error:', err);
    } finally {
      // Jump to 100% then clear
      if (importTimerRef.current) clearInterval(importTimerRef.current);
      setImportProgress(100);
      setTimeout(() => { setImporting(false); setImportProgress(0); }, 600);
    }
  };

  // Helper: parse multi-sheet CSV format for native import
  function parseMultiSheetCsvLocal(content: string): Map<string, Record<string, unknown>[]> {
    const sheets = new Map<string, Record<string, unknown>[]>();
    const sections = content.split(/\[SHEET:/).slice(1);
    for (const section of sections) {
      const nameEnd = section.indexOf(']');
      const name = section.slice(0, nameEnd);
      const lines = section.slice(nameEnd + 1).split('\n').filter(l => l.trim());
      if (lines.length < 2) { sheets.set(name, []); continue; }
      const header = parseCsvFieldsLocal(lines[0]);
      const rows: Record<string, unknown>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvFieldsLocal(lines[i]);
        const row: Record<string, unknown> = {};
        header.forEach((h, idx) => { row[h] = fields[idx] ?? ''; });
        rows.push(row);
      }
      sheets.set(name, rows);
    }
    return sheets;
  }

  function parseCsvFieldsLocal(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { fields.push(current); current = ''; }
      else current += ch;
    }
    fields.push(current);
    return fields;
  }

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 pt-4 space-y-4 safe-top pb-safe">
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
          {/* PIN Lock */}
          <PinLockSettings />
          {/* Currency */}
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">💱 Currency</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">Set the currency used across the app</p>
            <select
              value={localStorage.getItem('tracecash_currency') ?? 'PHP'}
              onChange={e => { localStorage.setItem('tracecash_currency', e.target.value); window.location.reload(); }}
              className={inputClass}
            >
              <option value="PHP">🇵🇭 PHP — Philippine Peso (₱)</option>
              <option value="USD">🇺🇸 USD — US Dollar ($)</option>
              <option value="EUR">🇪🇺 EUR — Euro (€)</option>
              <option value="GBP">🇬🇧 GBP — British Pound (£)</option>
              <option value="JPY">🇯🇵 JPY — Japanese Yen (¥)</option>
              <option value="KRW">🇰🇷 KRW — South Korean Won (₩)</option>
              <option value="CNY">🇨🇳 CNY — Chinese Yuan (¥)</option>
              <option value="INR">🇮🇳 INR — Indian Rupee (₹)</option>
              <option value="AUD">🇦🇺 AUD — Australian Dollar (A$)</option>
              <option value="CAD">🇨🇦 CAD — Canadian Dollar (C$)</option>
              <option value="SGD">🇸🇬 SGD — Singapore Dollar (S$)</option>
              <option value="MYR">🇲🇾 MYR — Malaysian Ringgit (RM)</option>
              <option value="THB">🇹🇭 THB — Thai Baht (฿)</option>
              <option value="IDR">🇮🇩 IDR — Indonesian Rupiah (Rp)</option>
              <option value="VND">🇻🇳 VND — Vietnamese Dong (₫)</option>
              <option value="BRL">🇧🇷 BRL — Brazilian Real (R$)</option>
              <option value="MXN">🇲🇽 MXN — Mexican Peso (MX$)</option>
              <option value="TWD">🇹🇼 TWD — Taiwan Dollar (NT$)</option>
              <option value="HKD">🇭🇰 HKD — Hong Kong Dollar (HK$)</option>
              <option value="CHF">🇨🇭 CHF — Swiss Franc</option>
              <option value="SEK">🇸🇪 SEK — Swedish Krona (kr)</option>
              <option value="NZD">🇳🇿 NZD — New Zealand Dollar (NZ$)</option>
              <option value="AED">🇦🇪 AED — UAE Dirham</option>
              <option value="SAR">🇸🇦 SAR — Saudi Riyal</option>
              <option value="NGN">🇳🇬 NGN — Nigerian Naira (₦)</option>
              <option value="ZAR">🇿🇦 ZAR — South African Rand (R)</option>
            </select>
          </div>
          {/* Export */}
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">📥 Export Full Backup</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              All data in one file: Accounts, Categories, Tags, Budgets, Recurring, Transactions — each in its own sheet
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleExportXlsx} disabled={exportingXlsx} className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                {exportingXlsx ? '⏳ Exporting...' : '📥 Download .xlsx'}
              </button>
              <button onClick={handleExportCsv} disabled={exportingCsv} className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium disabled:opacity-50">
                {exportingCsv ? '⏳ Exporting...' : '📥 Download .csv'}
              </button>
              {Capacitor.isNativePlatform() && (
                <button onClick={shareLastExport} disabled={!lastExportRef.current} className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium disabled:opacity-30">
                  📤 Share
                </button>
              )}
            </div>
          </div>

          {/* PDF Report */}
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">📄 Monthly PDF Report</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Generate a formatted financial report with summary, category breakdown, and transaction list
            </p>
            <div className="flex gap-2 items-center">
              <MonthPicker value={pdfMonth} onChange={setPdfMonth}
                className="p-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white" />
              <button
                onClick={async () => {
                  if (Capacitor.isNativePlatform()) {
                    try {
                      showToast('Generating PDF...', 'success');
                      const allTx = await getTransactionsByDate(`${pdfMonth}-01`, `${pdfMonth}-31T23:59:59`);
                      const { generateMonthlyPdf } = await import('../utils/pdfExport');
                      const base64 = await generateMonthlyPdf({ month: pdfMonth, transactions: allTx, categories, budgets });
                      const fileName = `TraceCash_Report_${pdfMonth}.pdf`;
                      await saveToDownloads(base64, fileName, 'application/pdf');
                    } catch (err) {
                      showToast('PDF generation failed', 'error');
                    }
                  } else {
                    window.open(`/api/export/pdf?month=${pdfMonth}`, '_blank');
                  }
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
              Supports: .xlsx (multi-sheet backup), .csv (legacy TraceCash app format)
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFilePreview(f);
                else { setImportFile(null); setImportPreview(null); }
              }}
              className="text-xs text-gray-500"
            />
            {previewLoading && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Reading file...</p>
              </div>
            )}
            {importPreview && (
              <div className="mt-3 space-y-2">
                {/* Summary */}
                <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{importPreview.summary}</p>
                </div>

                {/* CSV preview table */}
                {importPreview.fileType === 'csv' && importPreview.csvRows && importPreview.csvRows.length > 0 && (
                  <div className="overflow-x-auto">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                      Preview (first {Math.min(5, (importPreview.csvRows.length || 1) - 1)} of {importPreview.totalLines} rows):
                    </p>
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr>
                          {importPreview.csvRows[0]?.map((h, i) => (
                            <th key={i} className="px-1.5 py-1 bg-gray-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.csvRows.slice(1).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-1.5 py-1 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 max-w-[120px] truncate">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* XLSX sheet list */}
                {importPreview.fileType === 'xlsx' && importPreview.sheets && (
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Sheets:</p>
                    <div className="space-y-1">
                      {importPreview.sheets.map((s, i) => (
                        <div key={i} className="flex justify-between px-2 py-1 bg-gray-50 dark:bg-gray-700/50 rounded text-[11px]">
                          <span className="text-gray-700 dark:text-gray-300">{s.name}</span>
                          <span className="text-gray-500 dark:text-gray-400">{s.rowCount} rows</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Backup warning + Confirm Import */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-2.5">
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mb-1.5">⚠️ Recommend backing up first</p>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 mb-2.5">Duplicate transactions will be skipped, but importing the wrong file cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { await handleExportXlsx(); }}
                      className="flex-1 py-1.5 bg-white dark:bg-gray-700 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 rounded-lg text-[11px] font-medium hover:bg-amber-50 transition-colors"
                    >
                      📥 Export Backup
                    </button>
                    <button
                      onClick={() => { handleImportCsv(); setImportPreview(null); }}
                      disabled={importing}
                      className="flex-1 py-1.5 bg-emerald-500 disabled:bg-gray-400 text-white rounded-lg text-[11px] font-medium hover:bg-emerald-600 transition-colors"
                    >
                      {importing ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                          Importing...
                        </span>
                      ) : 'Import Anyway'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Import progress bar */}
            {importing && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Importing data...</span>
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{Math.round(importProgress)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-200 ease-out"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {importProgress < 30 ? 'Reading file…' : importProgress < 60 ? 'Processing records…' : importProgress < 90 ? 'Saving to database…' : 'Finishing up…'}
                </p>
              </div>
            )}

            {importResult && (
              <p className={`mt-2 text-xs ${importResult.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>
                {importResult}
              </p>
            )}
          </div>

          {/* Auto-backup */}
          <AutoBackupToggle />
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
        onToggleActive={toggleCategoryActive}
        onReorder={reorderCategories}
        onMerge={async (sourceId: number, targetId: number) => {
          if (Capacitor.isNativePlatform()) {
            const merged = await repo.mergeCategory(sourceId, targetId);
            await refresh();
            getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59').then(setAllTransactions);
            showToast(`Merged ${merged} transactions`, 'success');
          } else {
            const res = await post<{ merged: number }>('/api/categories/merge', { sourceId, targetId });
            await refresh();
            getTransactionsByDate('2000-01-01', '2099-12-31T23:59:59').then(setAllTransactions);
            showToast(`Merged ${res.merged} transactions`, 'success');
          }
        }}
        navigate={navigate}
      />}

      {/* Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-2">
          <button onClick={() => openModal('account')} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
            + Add Account
          </button>
          {accounts.map((a, idx) => (
            <div key={a.id} className={`flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40 ${!a.active ? 'opacity-50' : ''}`}>
              {/* Sort arrows */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => moveItem(accounts, idx, -1, reorderAccounts)}
                  disabled={idx === 0}
                  className="text-[10px] text-gray-400 hover:text-emerald-500 disabled:opacity-20 disabled:cursor-default leading-none">▲</button>
                <button onClick={() => moveItem(accounts, idx, 1, reorderAccounts)}
                  disabled={idx === accounts.length - 1}
                  className="text-[10px] text-gray-400 hover:text-emerald-500 disabled:opacity-20 disabled:cursor-default leading-none">▼</button>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: a.color + '20' }}>
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.name}</p>
                {!a.active && <p className="text-[10px] text-red-400">Inactive</p>}
              </div>
              <button onClick={() => toggleAccountActive(a.id)}
                className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${a.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                title={a.active ? 'Deactivate' : 'Activate'}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${a.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <button onClick={() => handleEditAcc(a)} className="text-gray-400 hover:text-blue-500 text-sm flex-shrink-0">✏️</button>
              <button onClick={async () => {
                if (!confirm('Delete this account?')) return;
                try { await removeAccount(a.id); showToast('Account deleted', 'success'); }
                catch (e: any) { showToast(e?.response?.data?.error || 'Cannot delete: account is in use', 'error'); }
              }} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* Tags Tab */}
      {activeTab === 'tags' && (
        <div className="space-y-3">
          <button onClick={() => openModal('tag')} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
            + Add Tag
          </button>
          {/* Global Tags */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Global Tags</h3>
              <span className="text-[10px] text-gray-400">Always shown</span>
            </div>
            <div className="space-y-1.5">
              {tags.filter(t => !t.category_id).map(t => {
                const linkedCat = t.category_id ? categories.find(c => c.id === t.category_id) : null;
                return (
                  <div key={t.id} className={`flex items-center gap-2 p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40 ${!t.active ? 'opacity-50' : ''}`}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</span>
                    </div>
                    {!t.active && <span className="text-[10px] text-red-400">Off</span>}
                    <button onClick={() => toggleTagActive(t.id)}
                      className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${t.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${t.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                    <button onClick={async () => {
                      if (!confirm('Delete this tag?')) return;
                      try { await removeTag(t.id); showToast('Tag deleted', 'success'); }
                      catch (e: any) { showToast(e?.response?.data?.error || 'Cannot delete', 'error'); }
                    }} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">🗑️</button>
                  </div>
                );
              })}
              {tags.filter(t => !t.category_id).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No global tags yet</p>
              )}
            </div>
          </div>
          {/* Category-Linked Tags */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Category Tags</h3>
              <span className="text-[10px] text-gray-400">Shown when category is selected</span>
            </div>
            <div className="space-y-1.5">
              {tags.filter(t => t.category_id).map(t => {
                const linkedCat = categories.find(c => c.id === t.category_id);
                return (
                  <div key={t.id} className={`flex items-center gap-2 p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40 ${!t.active ? 'opacity-50' : ''}`}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</span>
                      {linkedCat && (
                        <span className="text-[10px] text-gray-400 ml-1.5">{linkedCat.icon} {linkedCat.name}</span>
                      )}
                    </div>
                    {!t.active && <span className="text-[10px] text-red-400">Off</span>}
                    <button onClick={() => toggleTagActive(t.id)}
                      className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${t.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${t.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                    <button onClick={async () => {
                      if (!confirm('Delete this tag?')) return;
                      try { await removeTag(t.id); showToast('Tag deleted', 'success'); }
                      catch (e: any) { showToast(e?.response?.data?.error || 'Cannot delete', 'error'); }
                    }} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">🗑️</button>
                  </div>
                );
              })}
              {tags.filter(t => t.category_id).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No category-linked tags yet</p>
              )}
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              💡 <strong>Global tags</strong> always appear when adding a transaction. <strong>Category tags</strong> only appear when their linked category is selected.
            </p>
          </div>
        </div>
      )}

      {/* Budgets Tab */}
      {activeTab === 'budgets' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MonthPicker value={budgetMonth} onChange={v => { setBudgetMonth(v); loadBudgets(v); }} className={inputClass} />
            <button onClick={() => openModal('budget')} className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium whitespace-nowrap">+ Budget</button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{formatMonth(budgetMonth)}</p>
            <button
              onClick={async () => {
                const [y, m] = budgetMonth.split('-').map(Number);
                const prevDate = new Date(y, m - 2, 1);
                const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
                // Load previous month's budgets via API
                try {
                  const prevBudgets: typeof budgets = Capacitor.isNativePlatform()
                    ? await repo.getBudgets(prevMonth)
                    : await (await fetch(`/api/budgets?month=${prevMonth}`)).json();
                  if (!prevBudgets.length) {
                    showToast(`No budgets found in ${formatMonth(prevMonth)}`, 'error');
                    return;
                  }
                  let copied = 0;
                  for (const b of prevBudgets) {
                    await saveBudget(b.category_id, b.amount, budgetMonth);
                    copied++;
                  }
                  showToast(`Copied ${copied} budget${copied !== 1 ? 's' : ''} from ${formatMonth(prevMonth)}`, 'success');
                  await loadBudgets(budgetMonth);
                } catch {
                  showToast('Failed to copy budgets', 'error');
                }
              }}
              className="text-[11px] text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
            >
              📋 Copy from prev month
            </button>
          </div>
          {budgets.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400">No budgets set for this month</p>
              <p className="text-[10px] text-gray-400 mt-1">Tap "+ Budget" to create one, or copy from previous month</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...budgets].sort((a, b) => b.amount - a.amount).map(b => (
                <BudgetProgress
                  key={b.id}
                  budget={b}
                  onEdit={() => handleEditBudget(b)}
                  onDelete={() => { if (confirm('Delete this budget?')) removeBudget(b.id); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recurring Tab — grouped by income/expense */}
      {activeTab === 'recurring' && (
        <div className="space-y-2">
          <button onClick={() => openModal('recurring')} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">
            + Add Recurring
          </button>
          {recurring.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No recurring transactions</p>
          ) : (
            <>
              {/* Expense recurring */}
              {recurring.filter(r => r.type === 'expense').length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Expenses</h3>
                    <span className="text-[10px] text-gray-400">{recurring.filter(r => r.type === 'expense').length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {[...recurring].filter(r => r.type === 'expense').sort((a, b) => b.amount - a.amount).map(r => (
                      <div key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border ${r.active ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-500/40' : 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 opacity-60'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {!r.active && <span className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5">Inactive</span>}
                            <p className={`text-sm font-medium truncate ${r.active ? 'text-gray-900 dark:text-white' : 'text-gray-500 line-through'}`}>
                              {r.amount === 0 ? 'Variable' : formatCurrency(r.amount)} — {r.category_name ?? r.type}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">{r.recurrence_type} · {r.account_name} · Next: {r.next_date}</p>
                        </div>
                        <button onClick={() => editRecurring(r.id, { active: !r.active })} className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors ${r.active ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-red-100 hover:text-red-500' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200'}`}>{r.active ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => handleEditRecurring(r)} className="text-gray-400 hover:text-blue-500 text-sm">✏️</button>
                        <button onClick={() => { if (confirm('Delete?')) removeRecurring(r.id); }} className="text-gray-400 hover:text-red-500 text-sm">🗑️</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Income recurring */}
              {recurring.filter(r => r.type === 'income').length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5 mt-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Income</h3>
                    <span className="text-[10px] text-gray-400">{recurring.filter(r => r.type === 'income').length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {[...recurring].filter(r => r.type === 'income').sort((a, b) => b.amount - a.amount).map(r => (
                      <div key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border ${r.active ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-500/40' : 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 opacity-60'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {!r.active && <span className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5">Inactive</span>}
                            <p className={`text-sm font-medium truncate ${r.active ? 'text-gray-900 dark:text-white' : 'text-gray-500 line-through'}`}>
                              {r.amount === 0 ? 'Variable' : formatCurrency(r.amount)} — {r.category_name ?? r.type}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">{r.recurrence_type} · {r.account_name} · Next: {r.next_date}</p>
                        </div>
                        <button onClick={() => editRecurring(r.id, { active: !r.active })} className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors ${r.active ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-red-100 hover:text-red-500' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200'}`}>{r.active ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => handleEditRecurring(r)} className="text-gray-400 hover:text-blue-500 text-sm">✏️</button>
                        <button onClick={() => { if (confirm('Delete?')) removeRecurring(r.id); }} className="text-gray-400 hover:text-red-500 text-sm">🗑️</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Link to Category (optional)</label>
            <select value={tagCategoryId} onChange={e => setTagCategoryId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">🌐 Global — always shown</option>
              {categories.filter(c => !c.name.startsWith('_') && c.icon !== '??' && c.icon !== '?').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Category tags only appear when that category is selected</p>
          </div>
          <button onClick={handleSaveTag} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>

      <Modal open={showModal && modalType === 'budget'} onClose={() => setShowModal(false)} title={editBudgetId ? 'Edit Budget' : 'Set Budget'}>
        <div className="space-y-3">
          <select value={budgetCatId} onChange={e => setBudgetCatId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
            {/* Overall budget option — hide if already set (unless editing it) */}
            {(!editBudgetId || budgetCatId !== '') && !budgets.some(b => b.category_id === null && b.id !== editBudgetId) && (
              <option value="">📊 Overall Budget</option>
            )}
            {categories
              .filter(c =>
                c.active !== false &&
                c.type !== 'income' &&
                !c.name.startsWith('_') &&
                c.icon !== '??' && c.icon !== '?'
              )
              .filter(c => {
                if (editBudgetId) return true;
                return !budgets.some(b => b.category_id === c.id);
              })
              .map(c => <option key={c.id} value={c.id}>{c.icon || '📦'} {c.name}</option>)
            }
          </select>
          <input type="number" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} placeholder="Budget amount (₱)" className={inputClass} inputMode="decimal" />
          <button onClick={handleSaveBudget} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save</button>
        </div>
      </Modal>

      <Modal open={showModal && modalType === 'recurring'} onClose={() => setShowModal(false)} title={editRecId ? 'Edit Recurring' : 'Add Recurring Transaction'}>
        <div className="space-y-3">
          <div>
            <input type="number" value={recAmount} onChange={e => setRecAmount(e.target.value)} placeholder="Amount (₱) — leave blank for variable" className={inputClass} inputMode="decimal" />
            {recAmount === '' && <p className="text-[10px] text-amber-500 mt-1">Variable amount — won't auto-generate, acts as a reminder</p>}
          </div>
          <select value={recType} onChange={e => setRecType(e.target.value as TransactionType)} className={inputClass}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select value={recCatId} onChange={e => setRecCatId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
            <option value="">No category</option>
            {categories.filter(c => c.active !== false && !c.name.startsWith('_') && c.icon !== '??' && c.icon !== '?' && (c.type === recType || c.type === 'both')).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select value={recAccId} onChange={e => setRecAccId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
            <option value="">Select account</option>
            {accounts.filter(a => a.active !== false).map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
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
function CategoriesTab({ categories, transactions, onAdd, onEdit, onDelete, onToggleActive, onReorder, onMerge, navigate }: {
  categories: Category[];
  transactions: Transaction[];
  onAdd: () => void;
  onEdit: (c: Category) => void;
  onDelete: (id: number) => void;
  onToggleActive: (id: number) => void;
  onReorder: (ids: number[]) => Promise<void>;
  onMerge: (sourceId: number, targetId: number) => Promise<void>;
  navigate: (path: string) => void;
}) {
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [mergeCat, setMergeCat] = useState<Category | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | ''>('');

  const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both');
  const incomeCats = categories.filter(c => c.type === 'income' || c.type === 'both');

  const selectedCatTx = selectedCat
    ? transactions.filter(t => t.category_id === selectedCat.id)
    : [];
  const selectedCatTotal = selectedCatTx.reduce((s, t) => s + t.amount, 0);

  const moveInList = async (list: Category[], index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    // Build full ID order: all categories in current order, with these two swapped
    const allIds = categories.map(cat => cat.id);
    const aIdx = allIds.indexOf(list[index].id);
    const bIdx = allIds.indexOf(list[newIdx].id);
    [allIds[aIdx], allIds[bIdx]] = [allIds[bIdx], allIds[aIdx]];
    await onReorder(allIds);
  };

  const PROTECTED_CATS = ['Lent Money', 'Lent Payment', 'Debt', 'Debt Payment'];

  const renderCat = (c: Category, list: Category[], index: number) => {
    const isProtected = PROTECTED_CATS.includes(c.name);
    const txCount = transactions.filter(t => t.category_id === c.id).length;
    const total = transactions.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0);
    return (
      <div key={c.id} className={`flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40 ${!c.active ? 'opacity-50' : ''}`}>
        {/* Sort arrows */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button onClick={() => moveInList(list, index, -1)} disabled={index === 0}
            className="text-[10px] text-gray-400 hover:text-emerald-500 disabled:opacity-20 disabled:cursor-default leading-none">▲</button>
          <button onClick={() => moveInList(list, index, 1)} disabled={index === list.length - 1}
            className="text-[10px] text-gray-400 hover:text-emerald-500 disabled:opacity-20 disabled:cursor-default leading-none">▼</button>
        </div>
        <button
          onClick={() => setSelectedCat(c)}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: c.color + '25' }}>
            {c.icon}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {txCount} entries · {formatCurrency(total)}
              {isProtected && <span className="text-amber-500 ml-1">· System</span>}
              {!c.active && <span className="text-red-400 ml-1">· Inactive</span>}
            </p>
          </div>
          <span className="text-gray-400 dark:text-gray-500 text-xs">›</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive(c.id); }}
          className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${c.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          title={c.active ? 'Deactivate' : 'Activate'}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${c.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        {isProtected && <span className="text-[10px] text-amber-500 flex-shrink-0" title="System category (Debt Tracker)">🔒</span>}
        {!isProtected && <button onClick={(e) => { e.stopPropagation(); setMergeCat(c); setMergeTargetId(''); }} className="text-gray-400 hover:text-purple-500 text-sm flex-shrink-0" title="Merge into another category">🔀</button>}
        <button onClick={(e) => { e.stopPropagation(); onEdit(c); }} className="text-gray-400 hover:text-blue-500 text-sm flex-shrink-0">✏️</button>
        {!isProtected && <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete category?')) onDelete(c.id); }} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">🗑️</button>}
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
        <div className="space-y-1.5">{expenseCats.map((c, i) => renderCat(c, expenseCats, i))}</div>
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
        <div className="space-y-1.5">{incomeCats.map((c, i) => renderCat(c, incomeCats, i))}</div>
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

      {/* Merge Category Modal */}
      <Modal open={!!mergeCat} onClose={() => setMergeCat(null)} title={mergeCat ? `Merge "${mergeCat.name}" into...` : ''}>
        {mergeCat && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              All transactions, budgets, and recurring entries from <strong>{mergeCat.icon} {mergeCat.name}</strong> will be moved to the selected category. The source category will be deleted.
            </p>
            <select
              value={mergeTargetId}
              onChange={e => setMergeTargetId(Number(e.target.value))}
              className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white"
            >
              <option value="">Select target category...</option>
              {categories
                .filter(c => c.id !== mergeCat.id && (c.type === mergeCat.type || c.type === 'both' || mergeCat.type === 'both'))
                .map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))
              }
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setMergeCat(null)}
                className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!mergeTargetId) return;
                  await onMerge(mergeCat.id, mergeTargetId as number);
                  setMergeCat(null);
                }}
                disabled={!mergeTargetId}
                className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
              >
                Merge
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
