import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const items = await prisma.recurringTransaction.findMany({
    where: { active: true },
    orderBy: { next_date: 'asc' },
  });

  // Join category and account names
  const categories = await prisma.category.findMany();
  const accounts = await prisma.account.findMany();
  const catMap = new Map(categories.map(c => [c.id, c.name]));
  const accMap = new Map(accounts.map(a => [a.id, a.name]));

  res.json(items.map(r => ({
    ...r,
    category_name: r.category_id ? catMap.get(r.category_id) ?? null : null,
    account_name: accMap.get(r.account_id) ?? null,
  })));
});

router.post('/', async (req, res) => {
  const { amount, type, category_id, account_id, notes, recurrence_type, next_date } = req.body;
  const item = await prisma.recurringTransaction.create({
    data: { amount, type, category_id, account_id, notes: notes ?? '', recurrence_type, next_date },
  });
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  await prisma.recurringTransaction.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

export default router;
