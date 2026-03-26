import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] });
  res.json(accounts);
});

// POST /api/accounts/reorder — update sort order for all accounts
router.post('/reorder', async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  for (let i = 0; i < ids.length; i++) {
    await prisma.account.update({ where: { id: ids[i] }, data: { sort_order: i } });
  }
  res.json({ ok: true });
});

router.post('/', async (req, res) => {
  const { name, icon, color, initialBalance } = req.body;
  const acc = await prisma.account.create({
    data: { name, icon, color, initial_balance: initialBalance ?? 0 },
  });
  res.json(acc);
});

router.put('/:id', async (req, res) => {
  const { name, icon, color, active } = req.body;
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (icon !== undefined) data.icon = icon;
  if (color !== undefined) data.color = color;
  if (active !== undefined) data.active = active;
  const acc = await prisma.account.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(acc);
});

// PATCH /api/accounts/:id/toggle — toggle active status
router.patch('/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  const acc = await prisma.account.findUnique({ where: { id } });
  if (!acc) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.account.update({
    where: { id },
    data: { active: !acc.active },
  });
  res.json(updated);
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
