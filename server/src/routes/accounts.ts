import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });
  res.json(accounts);
});

router.post('/', async (req, res) => {
  const { name, icon, color, initialBalance } = req.body;
  const acc = await prisma.account.create({
    data: { name, icon, color, initial_balance: initialBalance ?? 0 },
  });
  res.json(acc);
});

router.put('/:id', async (req, res) => {
  const { name, icon, color } = req.body;
  const acc = await prisma.account.update({
    where: { id: Number(req.params.id) },
    data: { name, icon, color },
  });
  res.json(acc);
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const usedCount = await prisma.transaction.count({
    where: { OR: [{ account_id: id }, { to_account_id: id }] },
  });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: used in ${usedCount} transaction(s)` });
    return;
  }
  await prisma.account.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
