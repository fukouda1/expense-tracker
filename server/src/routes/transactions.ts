import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

// GET /api/transactions?limit=50&offset=0&from=&to=
router.get('/', async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  // If date range provided, return all matching (no limit). Otherwise apply limit for pagination.
  const limit = from && to ? undefined : (Number(req.query.limit) || 50);
  const offset = Number(req.query.offset) || 0;

  const where: any = {};
  if (from && to) {
    where.date = { gte: from, lte: to };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true, account: true, to_account: true, tags: { include: { tag: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    ...(limit ? { take: limit } : {}),
    skip: offset,
  });

  res.json(transactions.map(t => ({
    id: t.id,
    amount: t.amount,
    type: t.type,
    category_id: t.category_id,
    account_id: t.account_id,
    to_account_id: t.to_account_id,
    date: t.date,
    notes: t.notes,
    created_at: t.created_at,
    category_name: t.category?.name ?? null,
    category_icon: t.category?.icon ?? null,
    category_color: t.category?.color ?? null,
    account_name: t.account.name,
    to_account_name: t.to_account?.name ?? null,
    tags: t.tags.map(tt => tt.tag),
  })));
});

// GET /api/transactions/search
router.get('/search', async (req, res) => {
  const { search, from, to, categoryId, accountId, type, amountMin, amountMax } = req.query;
  const where: any = {};

  if (search) where.notes = { contains: search as string };
  if (from && to) where.date = { gte: from as string, lte: to as string };
  if (categoryId) where.category_id = Number(categoryId);
  if (accountId) where.account_id = Number(accountId);
  if (type) where.type = type as string;
  if (amountMin || amountMax) {
    where.amount = {};
    if (amountMin) where.amount.gte = Number(amountMin);
    if (amountMax) where.amount.lte = Number(amountMax);
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true, account: true, to_account: true },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 200,
  });

  res.json(transactions.map(t => ({
    id: t.id, amount: t.amount, type: t.type,
    category_id: t.category_id, account_id: t.account_id,
    to_account_id: t.to_account_id, date: t.date, notes: t.notes,
    category_name: t.category?.name, category_icon: t.category?.icon,
    category_color: t.category?.color, account_name: t.account.name,
    to_account_name: t.to_account?.name,
  })));
});

// POST /api/transactions
router.post('/', async (req, res) => {
  const { amount, type, category_id, account_id, to_account_id, date, notes, tagIds } = req.body;
  const tx = await prisma.transaction.create({
    data: {
      amount, type, category_id, account_id, to_account_id, date,
      notes: notes ?? '',
      tags: tagIds?.length ? { create: tagIds.map((id: number) => ({ tag_id: id })) } : undefined,
    },
  });
  res.json(tx);
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { amount, type, category_id, account_id, to_account_id, date, notes, tagIds } = req.body;

  await prisma.transactionTag.deleteMany({ where: { transaction_id: id } });
  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      amount, type, category_id, account_id, to_account_id, date, notes,
      tags: tagIds?.length ? { create: tagIds.map((id: number) => ({ tag_id: id })) } : undefined,
    },
  });
  res.json(tx);
});

// POST /api/transactions/copy-day — duplicate all transactions from one date to another
router.post('/copy-day', async (req, res) => {
  const { sourceDate, targetDate } = req.body;
  if (!sourceDate || !targetDate) {
    res.status(400).json({ error: 'sourceDate and targetDate required' });
    return;
  }

  const sourceTxs = await prisma.transaction.findMany({
    where: { date: { gte: sourceDate, lt: sourceDate + 'T23:59:59' } },
    include: { tags: true },
  });

  if (sourceTxs.length === 0) {
    res.status(404).json({ error: 'No transactions found on source date' });
    return;
  }

  let created = 0;
  for (const tx of sourceTxs) {
    // Replace the date portion but keep the time
    const timePart = tx.date.includes('T') ? tx.date.slice(10) : 'T12:00';
    const newDate = targetDate + timePart;
    await prisma.transaction.create({
      data: {
        amount: tx.amount,
        type: tx.type,
        category_id: tx.category_id,
        account_id: tx.account_id,
        to_account_id: tx.to_account_id,
        date: newDate,
        notes: tx.notes,
        tags: tx.tags.length > 0
          ? { create: tx.tags.map(t => ({ tag_id: t.tag_id })) }
          : undefined,
      },
    });
    created++;
  }

  res.json({ ok: true, created });
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  await prisma.transactionTag.deleteMany({ where: { transaction_id: id } });
  await prisma.transaction.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
