import { Router } from 'express';
import prisma from '../utils/db.js';
import { logAudit } from '../utils/audit.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const VALID_TYPES = ['income', 'expense', 'transfer'] as const;

function validateTransaction(body: any, partial = false) {
  const { amount, type, account_id, date, to_account_id } = body;
  if (!partial) {
    if (amount === undefined || amount === null) return 'amount is required';
    if (account_id === undefined || account_id === null) return 'account_id is required';
    if (!date) return 'date is required';
    if (!type) return 'type is required';
  }
  if (amount !== undefined) {
    const n = Number(amount);
    if (isNaN(n) || n <= 0) return 'amount must be a positive number';
    if (n > 10_000_000) return 'amount cannot exceed ₱10,000,000';
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return `type must be one of: ${VALID_TYPES.join(', ')}`;
  }
  if (type === 'transfer' && !to_account_id) {
    return 'to_account_id is required for transfers';
  }
  if (type === 'transfer' && to_account_id && Number(to_account_id) === Number(account_id)) {
    return 'to_account_id must differ from account_id';
  }
  if (date) {
    const txDate = new Date(date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    if (isNaN(txDate.getTime())) return 'date is invalid';
    if (txDate > tomorrow) return 'Transaction date cannot be more than 1 day in the future';
  }
  return null;
}

// GET /api/transactions?limit=50&offset=0&from=&to=
router.get('/', asyncHandler(async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
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
}));

// GET /api/transactions/search?...&limit=50&offset=0
router.get('/search', asyncHandler(async (req, res) => {
  const { search, from, to, categoryId, accountId, type, amountMin, amountMax } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const where: any = {};

  if (search) {
    const s = search as string;
    where.OR = [
      { notes: { contains: s } },
      { category: { name: { contains: s } } },
      { account: { name: { contains: s } } },
    ];
    // If search is a number, also match by amount
    if (!isNaN(Number(s))) {
      where.OR.push({ amount: Number(s) });
    }
  }
  if (from && to) where.date = { gte: from as string, lte: to as string };
  if (categoryId) {
    const id = Number(categoryId);
    if (!isNaN(id)) where.category_id = id;
  }
  if (accountId) {
    const id = Number(accountId);
    if (!isNaN(id)) where.account_id = id;
  }
  if (type && VALID_TYPES.includes(type as any)) where.type = type as string;
  if (amountMin || amountMax) {
    where.amount = {};
    if (amountMin && !isNaN(Number(amountMin))) where.amount.gte = Number(amountMin);
    if (amountMax && !isNaN(Number(amountMax))) where.amount.lte = Number(amountMax);
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, account: true, to_account: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    results: transactions.map(t => ({
      id: t.id, amount: t.amount, type: t.type,
      category_id: t.category_id, account_id: t.account_id,
      to_account_id: t.to_account_id, date: t.date, notes: t.notes,
      category_name: t.category?.name ?? null, category_icon: t.category?.icon ?? null,
      category_color: t.category?.color ?? null, account_name: t.account.name,
      to_account_name: t.to_account?.name ?? null,
    })),
  });
}));

// POST /api/transactions
router.post('/', asyncHandler(async (req, res) => {
  const { amount, type, category_id, account_id, to_account_id, date, notes, tagIds } = req.body;

  const err = validateTransaction(req.body);
  if (err) { res.status(400).json({ error: err }); return; }

  // Duplicate guard: reject if identical transaction already exists
  const duplicate = await prisma.transaction.findFirst({
    where: {
      date,
      amount: Number(amount),
      type,
      account_id: Number(account_id),
    },
  });
  if (duplicate) {
    res.status(409).json({ error: 'A transaction with the same date, amount, type, and account already exists.' });
    return;
  }

  const tx = await prisma.transaction.create({
    data: {
      amount: Number(amount), type, category_id: category_id ?? null,
      account_id: Number(account_id),
      to_account_id: to_account_id ? Number(to_account_id) : null,
      date, notes: notes ?? '',
      tags: tagIds?.length ? { create: tagIds.map((id: number) => ({ tag_id: id })) } : undefined,
    },
  });
  await logAudit('create', 'transaction', tx.id, JSON.stringify({ amount, type, category_id }));
  res.json(tx);
}));

// PUT /api/transactions/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const { amount, type, category_id, account_id, to_account_id, date, notes, tagIds } = req.body;

  const err = validateTransaction(req.body, true);
  if (err) { res.status(400).json({ error: err }); return; }

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Transaction not found' }); return; }

  // Duplicate guard on edit — compare resolved final values against other transactions
  const resolvedAmount = amount !== undefined ? Number(amount) : existing.amount;
  const resolvedType = type !== undefined ? type : existing.type;
  const resolvedAccountId = account_id !== undefined ? Number(account_id) : existing.account_id;
  const resolvedDate = date !== undefined ? date : existing.date;

  if (amount !== undefined || type !== undefined || account_id !== undefined || date !== undefined) {
    const duplicate = await prisma.transaction.findFirst({
      where: {
        id: { not: id },
        date: resolvedDate,
        amount: resolvedAmount,
        type: resolvedType,
        account_id: resolvedAccountId,
      },
    });
    if (duplicate) {
      res.status(409).json({ error: 'A transaction with the same date, amount, type, and account already exists.' });
      return;
    }
  }

  await prisma.transactionTag.deleteMany({ where: { transaction_id: id } });
  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      ...(amount !== undefined ? { amount: Number(amount) } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(category_id !== undefined ? { category_id } : {}),
      ...(account_id !== undefined ? { account_id: Number(account_id) } : {}),
      ...(to_account_id !== undefined ? { to_account_id: to_account_id ? Number(to_account_id) : null } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(notes !== undefined ? { notes } : {}),
      tags: tagIds?.length ? { create: tagIds.map((id: number) => ({ tag_id: id })) } : undefined,
    },
  });
  await logAudit('update', 'transaction', id, JSON.stringify(req.body));
  res.json(tx);
}));

// POST /api/transactions/copy-day
router.post('/copy-day', asyncHandler(async (req, res) => {
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
  let skipped = 0;
  for (const tx of sourceTxs) {
    const timePart = tx.date.includes('T') ? tx.date.slice(10) : 'T12:00';
    const newDate = targetDate + timePart;

    // Skip if duplicate already exists on target date
    const existing = await prisma.transaction.findFirst({
      where: { date: newDate, amount: tx.amount, type: tx.type, account_id: tx.account_id },
    });
    if (existing) { skipped++; continue; }

    await prisma.transaction.create({
      data: {
        amount: tx.amount, type: tx.type, category_id: tx.category_id,
        account_id: tx.account_id, to_account_id: tx.to_account_id,
        date: newDate, notes: tx.notes,
        tags: tx.tags.length > 0
          ? { create: tx.tags.map(t => ({ tag_id: t.tag_id })) }
          : undefined,
      },
    });
    created++;
  }

  res.json({ ok: true, created, skipped });
}));

// POST /api/transactions/split
router.post('/split', asyncHandler(async (req, res) => {
  const { id, splits } = req.body as { id: number; splits: Array<{ amount: number; category_id: number }> };
  if (!id || !splits || splits.length < 2) {
    res.status(400).json({ error: 'Need transaction id and at least 2 splits' });
    return;
  }

  for (const s of splits) {
    if (!s.amount || Number(s.amount) <= 0) {
      res.status(400).json({ error: 'Each split amount must be positive' });
      return;
    }
  }

  const original = await prisma.transaction.findUnique({ where: { id: Number(id) } });
  if (!original) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  const splitTotal = splits.reduce((sum, s) => sum + Number(s.amount), 0);
  if (Math.abs(splitTotal - original.amount) > 0.01) {
    res.status(400).json({ error: `Split amounts (${splitTotal}) must equal original amount (${original.amount})` });
    return;
  }

  await prisma.transactionTag.deleteMany({ where: { transaction_id: Number(id) } });
  await prisma.transaction.delete({ where: { id: Number(id) } });

  let created = 0;
  for (const split of splits) {
    await prisma.transaction.create({
      data: {
        amount: Number(split.amount), type: original.type, category_id: split.category_id,
        account_id: original.account_id, to_account_id: original.to_account_id,
        date: original.date, notes: original.notes,
      },
    });
    created++;
  }

  res.json({ created });
}));

// GET /api/transactions/:id — must be after all literal path routes (search, split, etc.)
router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const t = await prisma.transaction.findUnique({
    where: { id },
    include: { category: true, account: true, to_account: true, tags: { include: { tag: true } } },
  });
  if (!t) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({
    id: t.id, amount: t.amount, type: t.type,
    category_id: t.category_id, account_id: t.account_id, to_account_id: t.to_account_id,
    date: t.date, notes: t.notes, created_at: t.created_at,
    category_name: t.category?.name ?? null, category_icon: t.category?.icon ?? null,
    category_color: t.category?.color ?? null,
    account_name: t.account.name, to_account_name: t.to_account?.name ?? null,
    tags: t.tags.map(tt => tt.tag),
  });
}));

// DELETE /api/transactions/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Transaction not found' }); return; }

  await prisma.transactionTag.deleteMany({ where: { transaction_id: id } });
  await prisma.transaction.delete({ where: { id } });
  await logAudit('delete', 'transaction', id);
  res.json({ ok: true });
}));

export default router;
