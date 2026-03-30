import { Router } from 'express';
import prisma from '../utils/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const VALID_TYPES = ['income', 'expense', 'transfer'];
const VALID_RECURRENCE = ['daily', 'weekly', 'monthly', 'yearly'];

router.get('/', asyncHandler(async (_req, res) => {
  const items = await prisma.recurringTransaction.findMany({
    orderBy: { amount: 'desc' },
  });

  const categories = await prisma.category.findMany();
  const accounts = await prisma.account.findMany();
  const catMap = new Map(categories.map(c => [c.id, c.name]));
  const accMap = new Map(accounts.map(a => [a.id, a.name]));

  res.json(items.map(r => ({
    ...r,
    category_name: r.category_id ? catMap.get(r.category_id) ?? null : null,
    account_name: accMap.get(r.account_id) ?? null,
  })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { amount, type, category_id, account_id, notes, recurrence_type, next_date } = req.body;

  if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) {
    res.status(400).json({ error: 'amount must be a non-negative number (0 = variable)' }); return;
  }
  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }); return;
  }
  if (!account_id) {
    res.status(400).json({ error: 'account_id is required' }); return;
  }
  if (!recurrence_type || !VALID_RECURRENCE.includes(recurrence_type)) {
    res.status(400).json({ error: `recurrence_type must be one of: ${VALID_RECURRENCE.join(', ')}` }); return;
  }
  if (!next_date) {
    res.status(400).json({ error: 'next_date is required' }); return;
  }

  const item = await prisma.recurringTransaction.create({
    data: {
      amount: Number(amount), type,
      category_id: category_id ? Number(category_id) : null,
      account_id: Number(account_id),
      notes: notes ?? '', recurrence_type, next_date,
    },
  });
  res.json(item);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.recurringTransaction.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Recurring transaction not found' }); return; }

  const { amount, type, category_id, account_id, notes, recurrence_type, next_date, active } = req.body;

  if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) < 0)) {
    res.status(400).json({ error: 'amount must be a non-negative number (0 = variable)' }); return;
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }); return;
  }
  if (recurrence_type !== undefined && !VALID_RECURRENCE.includes(recurrence_type)) {
    res.status(400).json({ error: `recurrence_type must be one of: ${VALID_RECURRENCE.join(', ')}` }); return;
  }

  const data: any = {};
  if (amount !== undefined) data.amount = Number(amount);
  if (type !== undefined) data.type = type;
  if (category_id !== undefined) data.category_id = category_id ? Number(category_id) : null;
  if (account_id !== undefined) data.account_id = Number(account_id);
  if (notes !== undefined) data.notes = notes;
  if (recurrence_type !== undefined) data.recurrence_type = recurrence_type;
  if (next_date !== undefined) data.next_date = next_date;
  if (active !== undefined) data.active = Boolean(active);

  const item = await prisma.recurringTransaction.update({ where: { id }, data });
  res.json(item);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.recurringTransaction.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Recurring transaction not found' }); return; }

  await prisma.recurringTransaction.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
