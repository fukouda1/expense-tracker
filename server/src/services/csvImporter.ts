import prisma from '../utils/db.js';

// ══════════════════════════════════════════════════════
// Shared types
// ══════════════════════════════════════════════════════

type Row = Record<string, unknown>;
function str(row: Row, key: string): string { return String(row[key] ?? '').trim(); }
function num(row: Row, key: string): number { return parseFloat(String(row[key])) || 0; }
function int(row: Row, key: string): number { return parseInt(String(row[key])) || 0; }

interface ImportResult {
  accounts: number;
  categories: number;
  tags: number;
  budgets: number;
  recurring: number;
  transactions: number;
  duplicatesSkipped: number;
  errors: string[];
}

// ══════════════════════════════════════════════════════
// Universal Sheet Import (works for both .xlsx and parsed CSV)
// ══════════════════════════════════════════════════════

export async function importFromSheets(sheets: Map<string, Row[]>): Promise<ImportResult> {
  const result: ImportResult = { accounts: 0, categories: 0, tags: 0, budgets: 0, recurring: 0, transactions: 0, duplicatesSkipped: 0, errors: [] };

  // ── Accounts ──
  const accountRows = sheets.get('Accounts') ?? [];
  const accountIdMap = new Map<number, number>();
  for (let i = 0; i < accountRows.length; i++) {
    const r = accountRows[i];
    const name = str(r, 'NAME');
    if (!name) continue;
    try {
      const activeVal = str(r, 'ACTIVE');
      const isActive = activeVal === '' || (activeVal !== 'No' && activeVal !== '0' && activeVal !== 'false');
      const acc = await prisma.account.upsert({
        where: { name },
        create: { name, icon: str(r, 'ICON') || '💰', color: str(r, 'COLOR') || '#10b981', initial_balance: num(r, 'INITIAL_BALANCE'), sort_order: int(r, 'SORT_ORDER'), active: isActive },
        update: { active: isActive, sort_order: int(r, 'SORT_ORDER') || undefined },
      });
      accountIdMap.set(int(r, 'ID'), acc.id);
      result.accounts++;
    } catch (e: any) { result.errors.push(`Account "${name}": ${e.message}`); }
  }
  const allAccounts = await prisma.account.findMany();
  const accountNameMap = new Map(allAccounts.map(a => [a.name, a.id]));

  // ── Categories ──
  const catRows = sheets.get('Categories') ?? [];
  const catIdMap = new Map<number, number>();
  for (let i = 0; i < catRows.length; i++) {
    const r = catRows[i];
    const name = str(r, 'NAME');
    if (!name) continue;
    try {
      const catActiveVal = str(r, 'ACTIVE');
      const catIsActive = catActiveVal === '' || (catActiveVal !== 'No' && catActiveVal !== '0' && catActiveVal !== 'false');
      const cat = await prisma.category.upsert({
        where: { name },
        create: { name, icon: str(r, 'ICON') || '📦', color: str(r, 'COLOR') || '#6b7280', type: str(r, 'TYPE') || 'expense', sort_order: int(r, 'SORT_ORDER'), active: catIsActive },
        update: { active: catIsActive, sort_order: int(r, 'SORT_ORDER') || undefined },
      });
      catIdMap.set(int(r, 'ID'), cat.id);
      result.categories++;
    } catch (e: any) { result.errors.push(`Category "${name}": ${e.message}`); }
  }
  const allCats = await prisma.category.findMany();
  const catNameMap = new Map(allCats.map(c => [c.name, c.id]));

  // ── Tags ──
  const tagRows = sheets.get('Tags') ?? [];
  const tagNameMap = new Map<string, number>();
  for (const r of tagRows) {
    const name = str(r, 'NAME');
    if (!name) continue;
    try {
      const tagActiveVal = str(r, 'ACTIVE');
      const tagIsActive = tagActiveVal === '' || (tagActiveVal !== 'No' && tagActiveVal !== '0' && tagActiveVal !== 'false');
      const tag = await prisma.tag.upsert({
        where: { name },
        create: { name, color: str(r, 'COLOR') || '#3b82f6', sort_order: int(r, 'SORT_ORDER'), active: tagIsActive },
        update: { active: tagIsActive, sort_order: int(r, 'SORT_ORDER') || undefined },
      });
      tagNameMap.set(name, tag.id);
      result.tags++;
    } catch (e: any) { result.errors.push(`Tag "${name}": ${e.message}`); }
  }
  const allTags = await prisma.tag.findMany();
  for (const t of allTags) tagNameMap.set(t.name, t.id);

  // ── Budgets ──
  const budgetRows = sheets.get('Budgets') ?? [];
  for (const r of budgetRows) {
    const month = str(r, 'MONTH');
    const amount = num(r, 'AMOUNT');
    if (!month || !amount) continue;
    try {
      const catName = str(r, 'CATEGORY');
      const catId = catName ? (catNameMap.get(catName) ?? null) : null;
      await prisma.budget.upsert({
        where: { category_id_month: { category_id: catId as number, month } },
        create: { category_id: catId, amount, month },
        update: { amount },
      });
      result.budgets++;
    } catch (e: any) { result.errors.push(`Budget: ${e.message}`); }
  }

  // ── Recurring ──
  const recRows = sheets.get('Recurring') ?? [];
  for (const r of recRows) {
    const amount = num(r, 'AMOUNT');
    if (amount === undefined || (str(r, 'ID') === '' && amount === 0)) continue; // skip empty placeholder rows only
    try {
      const accId = accountIdMap.get(int(r, 'ACCOUNT_ID')) ?? int(r, 'ACCOUNT_ID');
      const catId = catIdMap.get(int(r, 'CATEGORY_ID')) ?? (int(r, 'CATEGORY_ID') || null);
      await prisma.recurringTransaction.create({
        data: {
          amount,
          type: str(r, 'TYPE') || 'expense',
          category_id: catId,
          account_id: accId,
          notes: str(r, 'NOTES'),
          recurrence_type: str(r, 'RECURRENCE') || str(r, 'RECURRENCE_TYPE') || 'monthly',
          next_date: str(r, 'NEXT_DATE'),
          active: str(r, 'ACTIVE') !== 'No' && str(r, 'ACTIVE') !== '0',
          auto_create: (() => { const v = str(r, 'AUTO_CREATE'); return v === '' || (v !== 'No' && v !== '0' && v !== 'false'); })(),
        },
      });
      result.recurring++;
    } catch (e: any) { result.errors.push(`Recurring: ${e.message}`); }
  }

  // ── Entrusted Funds ──
  const fundRows = sheets.get('EntrustedFunds') ?? [];
  const fundNameMap = new Map<string, number>();
  for (const f of await prisma.entrustedFund.findMany()) fundNameMap.set(f.name, f.id);
  for (const r of fundRows) {
    const name = str(r, 'NAME');
    if (!name) continue;
    try {
      if (fundNameMap.has(name)) continue;
      // MEMBERS is a JSON array string in newer backups; default to [] for older ones.
      const membersRaw = str(r, 'MEMBERS');
      let members = '[]';
      try { if (membersRaw) members = JSON.stringify(JSON.parse(membersRaw)); } catch { members = '[]'; }
      const fund = await prisma.entrustedFund.create({
        data: {
          name,
          target_amount: num(r, 'TARGET_AMOUNT'),
          notes: str(r, 'NOTES'),
          closed: str(r, 'CLOSED') === 'Yes',
          members,
        },
      });
      fundNameMap.set(name, fund.id);
    } catch (e: any) { result.errors.push(`EntrustedFund "${name}": ${e.message}`); }
  }

  // ── Transactions ──

  const txRows = sheets.get('Transactions') ?? [];
  for (let i = 0; i < txRows.length; i++) {
    const r = txRows[i];
    const amount = num(r, 'AMOUNT');
    if (!amount) continue;
    try {
      const accName = str(r, 'ACCOUNT');
      const accId = accountNameMap.get(accName);
      if (!accId) { result.errors.push(`Tx row ${i + 1}: unknown account "${accName}"`); continue; }
      const toAccName = str(r, 'TO_ACCOUNT');
      const toAccId = toAccName ? (accountNameMap.get(toAccName) ?? null) : null;
      const catName = str(r, 'CATEGORY');
      const catId = catName ? (catNameMap.get(catName) ?? null) : null;
      const fundName = str(r, 'ENTRUSTED_FUND');
      const fundId = fundName ? (fundNameMap.get(fundName) ?? null) : null;
      const txType = str(r, 'TYPE') || 'expense';
      const txDate = str(r, 'DATE');

      const tx = await prisma.transaction.create({
        data: {
          amount,
          type: txType,
          category_id: catId,
          account_id: accId,
          to_account_id: toAccId,
          date: txDate,
          notes: str(r, 'NOTES'),
          entrusted_fund_id: fundId,
        },
      });

      const tagStr = str(r, 'TAGS');
      if (tagStr) {
        const names = tagStr.split(';').map(s => s.trim()).filter(Boolean);
        for (const tn of names) {
          const tagId = tagNameMap.get(tn);
          if (tagId) await prisma.transactionTag.create({ data: { transaction_id: tx.id, tag_id: tagId } });
        }
      }
      result.transactions++;
    } catch (e: any) {
      result.errors.push(`Tx row ${i + 1}: ${e.message}`);
      if (result.errors.length > 50) break;
    }
  }

  result.duplicatesSkipped = 0;
  return result;
}

// ══════════════════════════════════════════════════════
// Legacy TraceCash CSV Import
// ══════════════════════════════════════════════════════

// Complete TraceCash app category mapping with correct types
const CATEGORY_MAP: Record<string, { name: string; icon: string; color: string; type: 'income' | 'expense' | 'both' }> = {
  // ── Expense-only ──
  '3) Food':               { name: 'Food',                icon: '🍔', color: '#ef4444', type: 'expense' },
  '3) Food - Work':        { name: 'Food - Work',         icon: '🍱', color: '#f97316', type: 'expense' },
  '2) Transpo':            { name: 'Transport',            icon: '🚌', color: '#3b82f6', type: 'expense' },
  '2) Transpo - Work':     { name: 'Transport - Work',     icon: '🚆', color: '#2563eb', type: 'expense' },
  '1) B - Apartment':      { name: 'Bills - Rent',         icon: '🏠', color: '#8b5cf6', type: 'expense' },
  '1) B - House (Cavite)': { name: 'Bills - House',        icon: '🏡', color: '#7c3aed', type: 'expense' },
  '1) B - Dental':         { name: 'Bills - Dental',       icon: '🦷', color: '#ec4899', type: 'expense' },
  '1) B - Food allowance': { name: 'Food Allowance',       icon: '🍚', color: '#f59e0b', type: 'expense' },
  '1) Bills - Foreman':    { name: 'Bills - Foreman',      icon: '👷', color: '#a855f7', type: 'expense' },
  '1) Bills - Internet':   { name: 'Bills - Internet',     icon: '📡', color: '#6366f1', type: 'expense' },
  'Medicine':              { name: 'Medicine',             icon: '💊', color: '#14b8a6', type: 'expense' },
  'Grocery':               { name: 'Grocery',              icon: '🛒', color: '#22c55e', type: 'expense' },
  'Online Shopping':       { name: 'Online Shopping',      icon: '🛍️', color: '#a855f7', type: 'expense' },
  'Electronics':           { name: 'Electronics',          icon: '📱', color: '#0ea5e9', type: 'expense' },
  'Social':                { name: 'Social',               icon: '🎉', color: '#f43f5e', type: 'expense' },
  'Z - Fitness':           { name: 'Fitness',              icon: '💪', color: '#10b981', type: 'expense' },
  'Fitness - Others':      { name: 'Fitness - Others',     icon: '🏋️', color: '#059669', type: 'expense' },
  'Pet Expenses':          { name: 'Pet Expenses',         icon: '🐾', color: '#d97706', type: 'expense' },
  'Clothing/Grooming':     { name: 'Clothing',             icon: '👕', color: '#7c3aed', type: 'expense' },
  'Outing Expenses':       { name: 'Outing',               icon: '🎯', color: '#f43f5e', type: 'expense' },
  'Celebration':           { name: 'Celebration',          icon: '🎊', color: '#ec4899', type: 'expense' },
  'Fin. Aid / Allowance':  { name: 'Fin. Aid / Allowance', icon: '🤝', color: '#f97316', type: 'expense' },
  'Gift':                  { name: 'Gift',                 icon: '🎁', color: '#ec4899', type: 'expense' },
  'Lent money':            { name: 'Lent Money',           icon: '💸', color: '#ef4444', type: 'expense' },
  'Debt payment':          { name: 'Debt Payment',         icon: '💳', color: '#6366f1', type: 'expense' },
  'Others':                { name: 'Others',               icon: '📦', color: '#6b7280', type: 'expense' },
  'House construction':    { name: 'House Construction',   icon: '🔨', color: '#d97706', type: 'expense' },
  'House Expense':         { name: 'House Expense',        icon: '🏠', color: '#8b5cf6', type: 'expense' },
  'Hospital bill':         { name: 'Hospital',             icon: '🏥', color: '#ef4444', type: 'expense' },
  'Tax - Bank Charges':    { name: 'Bank Charges',         icon: '🏦', color: '#6b7280', type: 'expense' },
  'Telephone':             { name: 'Telephone',            icon: '📞', color: '#0ea5e9', type: 'expense' },
  'C - Hon':               { name: 'C - Hon',              icon: '❤️', color: '#ec4899', type: 'expense' },
  'Z - Mama bday':         { name: 'Mama Birthday',        icon: '🎂', color: '#f43f5e', type: 'expense' },
  'Z - Smartphone':        { name: 'Smartphone',           icon: '📱', color: '#3b82f6', type: 'expense' },
  // ── Income-only ──
  'Salary':                { name: 'Salary',               icon: '💵', color: '#10b981', type: 'income' },
  'Bonus':                 { name: 'Bonus',                icon: '🎁', color: '#22c55e', type: 'income' },
  'Bank Interest':         { name: 'Bank Interest',        icon: '🏦', color: '#0ea5e9', type: 'income' },
  'Digital Bank Interest': { name: 'Digital Bank Interest', icon: '📱', color: '#14b8a6', type: 'income' },
  'Cash Back':             { name: 'Cash Back',            icon: '💸', color: '#14b8a6', type: 'income' },
  'Gift Check':            { name: 'Gift Check',           icon: '🎫', color: '#a855f7', type: 'income' },
  'Lent Payment':          { name: 'Lent Payment',         icon: '💰', color: '#22c55e', type: 'income' },
  'Receivable':            { name: 'Receivable',           icon: '📥', color: '#10b981', type: 'income' },
  // ── Both (used as income AND expense in TraceCash) ──
  'Balancing':             { name: 'Balancing',            icon: '⚖️', color: '#6b7280', type: 'both' },
  'Investments':           { name: 'Investments',          icon: '📈', color: '#10b981', type: 'both' },
  'Piggy Bank':            { name: 'Piggy Bank',           icon: '🐷', color: '#f59e0b', type: 'both' },
  'Debt':                  { name: 'Debt',                 icon: '📋', color: '#dc2626', type: 'both' },
  'Loan':                  { name: 'Loan',                 icon: '📝', color: '#dc2626', type: 'both' },
  'Loan Interest':         { name: 'Loan Interest',        icon: '📊', color: '#b91c1c', type: 'both' },
};

function parseCsvLine(line: string): string[] {
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

function parseDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  // Always try manual parse first — "Mar 01, 2024 10:07 AM" format
  const match = trimmed.match(/(\w+)\s+(\d+),\s+(\d+)\s+(\d+):(\d+)\s+(\w+)/);
  if (match) {
    const months: Record<string, string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    const [, mon, day, year, hr, min, ampm] = match;
    let hour = parseInt(hr);
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return `${year}-${months[mon]}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}`;
  }
  // Fallback: try native Date parser
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 16);
  }
  return d.toISOString().slice(0, 16);
}

export async function parseLegacyCsvAndImport(csvContent: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const rawLines = csvContent.split('\n');
  const lines: string[] = [];
  for (const line of rawLines) {
    const t = line.trimEnd();
    if (!t) continue;
    if (t.startsWith('"') || lines.length === 0) lines.push(t);
    else lines[lines.length - 1] += '\n' + t;
  }

  if (!lines[0]?.includes('TIME') && !lines[0]?.includes('TYPE')) return { imported: 0, skipped: 0, errors: ['Invalid CSV header'] };

  let imported = 0, skipped = 0;
  const errors: string[] = [];
  const catCache = new Map<string, number>();
  const accCache = new Map<string, number>();
  for (const c of await prisma.category.findMany()) catCache.set(c.name, c.id);
  for (const a of await prisma.account.findMany()) accCache.set(a.name, a.id);

  async function getOrCreateCat(orig: string): Promise<number | null> {
    const m = CATEGORY_MAP[orig];
    const name = m?.name ?? orig;
    if (catCache.has(name)) return catCache.get(name)!;
    try {
      const cat = await prisma.category.create({ data: { name, icon: m?.icon ?? '📦', color: m?.color ?? '#6b7280', type: m?.type ?? 'expense' } });
      catCache.set(name, cat.id); return cat.id;
    } catch { const e = await prisma.category.findUnique({ where: { name } }); if (e) { catCache.set(name, e.id); return e.id; } return null; }
  }
  async function getOrCreateAcc(name: string): Promise<number> {
    if (accCache.has(name)) return accCache.get(name)!;
    try {
      const acc = await prisma.account.create({ data: { name, icon: '💰', color: '#10b981', initial_balance: 0 } });
      accCache.set(name, acc.id); return acc.id;
    } catch { const e = await prisma.account.findUnique({ where: { name } }); if (e) { accCache.set(name, e.id); return e.id; } throw new Error(`Failed: ${name}`); }
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const f = parseCsvLine(lines[i]);
      if (f.length < 5) { skipped++; continue; }
      const [timeStr, typeStr, amountStr, catStr, accStr, ...notesParts] = f;
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) { skipped++; continue; }
      const type = typeStr.includes('Income') ? 'income' : typeStr.includes('Transfer') ? 'transfer' : 'expense';
      const date = parseDate(timeStr);
      let accId: number, toAccId: number | null = null, catId: number | null = null;
      if (type === 'transfer') {
        const parts = accStr.split('->');
        accId = await getOrCreateAcc(parts[0].trim());
        if (parts[1]) toAccId = await getOrCreateAcc(parts[1].trim());
      } else {
        accId = await getOrCreateAcc(accStr.trim());
        const cn = catStr.trim();
        if (cn && cn !== '-' && cn !== '  -  ') catId = await getOrCreateCat(cn);
      }
      const notes = notesParts.join(',').trim();

      await prisma.transaction.create({ data: { amount, type, category_id: catId, account_id: accId, to_account_id: toAccId, date, notes } });
      imported++;
    } catch (e: any) { errors.push(`Row ${i + 1}: ${e.message}`); if (errors.length > 20) break; }
  }
  return { imported, skipped, errors };
}

export const parseCsvAndImport = parseLegacyCsvAndImport;
