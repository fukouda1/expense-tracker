import { Router } from 'express';
import prisma from '../utils/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
    orderBy: { id: 'asc' },
  });

  const result = await Promise.all(budgets.map(async b => {
    const where: any = { type: 'expense', date: { startsWith: month } };
    if (b.category_id) where.category_id = b.category_id;
    const agg = await prisma.transaction.aggregate({ where, _sum: { amount: true } });
    return {
      id: b.id,
      category_id: b.category_id,
      amount: b.amount,
      month: b.month,
      category_name: b.category?.name ?? null,
      category_color: b.category?.color ?? null,
      spent: agg._sum.amount ?? 0,
    };
  }));

  res.json(result);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { categoryId, amount, month } = req.body;
  if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month must be in YYYY-MM format' }); return;
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'amount must be a positive number' }); return;
  }
  if (!categoryId) {
    res.status(400).json({ error: 'categoryId is required' }); return;
  }

  const budget = await prisma.budget.upsert({
    where: { category_id_month: { category_id: Number(categoryId), month } },
    create: { category_id: Number(categoryId), amount: amt, month },
    update: { amount: amt },
  });
  res.json(budget);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Budget not found' }); return; }

  const { categoryId, amount, month } = req.body;
  const data: any = {};
  if (amount !== undefined) {
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: 'amount must be a positive number' }); return; }
    data.amount = amt;
  }
  if (month !== undefined) {
    if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: 'month must be in YYYY-MM format' }); return; }
    data.month = month;
  }
  if (categoryId !== undefined) data.category_id = Number(categoryId);

  const budget = await prisma.budget.update({ where: { id }, data });
  res.json(budget);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Budget not found' }); return; }

  await prisma.budget.delete({ where: { id } });
  res.json({ ok: true });
}));

router.patch('/:id/toggle', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.budget.update({ where: { id }, data: { active: !budget.active } });
  res.json({ ok: true });
}));

export default router;
