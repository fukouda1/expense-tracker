import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
    orderBy: { id: 'asc' },
  });

  // Calculate spent for each budget
  const result = await Promise.all(budgets.map(async b => {
    const where: any = { type: 'expense', date: { startsWith: month } };
    if (b.category_id) where.category_id = b.category_id;
    const agg = await prisma.transaction.aggregate({
      where,
      _sum: { amount: true },
    });
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
});

router.post('/', async (req, res) => {
  const { categoryId, amount, month } = req.body;
  const budget = await prisma.budget.upsert({
    where: { category_id_month: { category_id: categoryId, month } },
    create: { category_id: categoryId, amount, month },
    update: { amount },
  });
  res.json(budget);
});

router.delete('/:id', async (req, res) => {
  await prisma.budget.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

export default router;
