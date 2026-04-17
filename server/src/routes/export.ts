import { Router } from 'express';
import prisma from '../utils/db.js';
import XLSX from 'xlsx';

const router = Router();

// GET /api/export/xlsx — full backup as Excel with real sheet tabs
router.get('/xlsx', async (_req, res) => {
  const wb = XLSX.utils.book_new();

  // ── Accounts ──
  const accounts = await prisma.account.findMany({ orderBy: { sort_order: 'asc' } });
  const accData = accounts.map(a => ({
    ID: a.id, NAME: a.name, ICON: a.icon, COLOR: a.color, INITIAL_BALANCE: a.initial_balance, SORT_ORDER: a.sort_order, ACTIVE: a.active ? 'Yes' : 'No',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accData), 'Accounts');

  // ── Categories ──
  const categories = await prisma.category.findMany({ orderBy: { sort_order: 'asc' } });
  const catData = categories.map(c => ({
    ID: c.id, NAME: c.name, ICON: c.icon, COLOR: c.color, TYPE: c.type, SORT_ORDER: c.sort_order, ACTIVE: c.active ? 'Yes' : 'No',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catData), 'Categories');

  // ── Tags ──
  const tags = await prisma.tag.findMany({ orderBy: { sort_order: 'asc' } });
  const tagData = tags.map(t => ({ ID: t.id, NAME: t.name, COLOR: t.color, SORT_ORDER: t.sort_order, ACTIVE: t.active ? 'Yes' : 'No' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tagData.length ? tagData : [{ ID: '', NAME: '', COLOR: '' }]), 'Tags');

  // ── Budgets ──
  const budgets = await prisma.budget.findMany({ orderBy: { id: 'asc' }, include: { category: true } });
  const budgetData = budgets.map(b => ({
    ID: b.id, CATEGORY: b.category?.name ?? '', AMOUNT: b.amount, MONTH: b.month,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetData.length ? budgetData : [{ ID: '', CATEGORY: '', AMOUNT: '', MONTH: '' }]), 'Budgets');

  // ── Recurring ──
  const recurring = await prisma.recurringTransaction.findMany({ orderBy: { id: 'asc' } });
  const recData = recurring.map(r => ({
    ID: r.id, AMOUNT: r.amount, TYPE: r.type, CATEGORY_ID: r.category_id,
    ACCOUNT_ID: r.account_id, NOTES: r.notes, RECURRENCE: r.recurrence_type,
    NEXT_DATE: r.next_date, ACTIVE: r.active ? 'Yes' : 'No',
    AUTO_CREATE: r.auto_create ? 'Yes' : 'No',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recData.length ? recData : [{ ID: '', AMOUNT: '', TYPE: '' }]), 'Recurring');

  // ── Transactions ──
  const transactions = await prisma.transaction.findMany({
    include: { category: true, account: true, to_account: true, tags: { include: { tag: true } } },
    orderBy: { date: 'asc' },
  });
  const txData = transactions.map(t => ({
    ID: t.id,
    DATE: t.date,
    TYPE: t.type,
    AMOUNT: t.amount,
    CATEGORY: t.category?.name ?? '',
    ACCOUNT: t.account.name,
    TO_ACCOUNT: t.to_account?.name ?? '',
    NOTES: t.notes,
    TAGS: t.tags.map(tt => tt.tag.name).join('; '),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txData), 'Transactions');

  // Write to buffer and send
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=tracecash_backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.send(Buffer.from(buf));
});

// GET /api/export/csv — legacy CSV for backward compatibility
router.get('/csv', async (_req, res) => {
  const transactions = await prisma.transaction.findMany({
    include: { category: true, account: true, to_account: true },
    orderBy: { date: 'asc' },
  });

  let csv = '"TIME","TYPE","AMOUNT","CATEGORY","ACCOUNT","NOTES"\n';
  for (const t of transactions) {
    const typeLabel = t.type === 'income' ? '(+) Income'
      : t.type === 'expense' ? '(-) Expense' : '(*) Transfer';
    const acct = t.type === 'transfer' && t.to_account
      ? `${t.account.name}->${t.to_account.name}` : t.account.name;
    const notes = (t.notes ?? '').replace(/"/g, '""');
    csv += `"${t.date}","${typeLabel}","${t.amount}","${t.category?.name ?? ''}","${acct}","${notes}"\n`;
  }

  res.json({ csv });
});

export default router;
