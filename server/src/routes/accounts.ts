import { Router } from 'express';
import prisma from '../utils/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] });
  res.json(accounts);
}));

// POST /api/accounts/reorder
router.post('/reorder', asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array' }); return;
  }
  for (let i = 0; i < ids.length; i++) {
    await prisma.account.update({ where: { id: Number(ids[i]) }, data: { sort_order: i } });
  }
  res.json({ ok: true });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, icon, color, initialBalance } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  const balance = Number(initialBalance ?? 0);
  if (isNaN(balance)) {
    res.status(400).json({ error: 'initialBalance must be a number' }); return;
  }
  const maxOrder = await prisma.account.aggregate({ _max: { sort_order: true } });
  const sort_order = (maxOrder._max.sort_order ?? -1) + 1;
  const acc = await prisma.account.create({
    data: { name: name.trim(), icon, color, initial_balance: balance, sort_order },
  });
  res.json(acc);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Account not found' }); return; }

  const { name, icon, color, active } = req.body;
  const data: any = {};
  if (name !== undefined) data.name = String(name).trim();
  if (icon !== undefined) data.icon = icon;
  if (color !== undefined) data.color = color;
  if (active !== undefined) data.active = Boolean(active);

  const acc = await prisma.account.update({ where: { id }, data });
  res.json(acc);
}));

// PATCH /api/accounts/:id/toggle
router.patch('/:id/toggle', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const acc = await prisma.account.findUnique({ where: { id } });
  if (!acc) { res.status(404).json({ error: 'Account not found' }); return; }

  const updated = await prisma.account.update({ where: { id }, data: { active: !acc.active } });
  res.json(updated);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Account not found' }); return; }

  const usedCount = await prisma.transaction.count({
    where: { OR: [{ account_id: id }, { to_account_id: id }] },
  });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: used in ${usedCount} transaction(s)` }); return;
  }
  await prisma.account.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
