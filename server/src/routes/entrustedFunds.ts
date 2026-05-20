import { Router } from 'express';
import prisma from '../utils/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// GET /api/entrusted-funds — list all funds
router.get('/', asyncHandler(async (_req, res) => {
  const funds = await prisma.entrustedFund.findMany({
    orderBy: [{ closed: 'asc' }, { created_at: 'desc' }],
  });
  res.json(funds);
}));

// POST /api/entrusted-funds
router.post('/', asyncHandler(async (req, res) => {
  const { name, target_amount, notes } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  const fund = await prisma.entrustedFund.create({
    data: {
      name: name.trim(),
      target_amount: target_amount != null && !isNaN(Number(target_amount)) ? Number(target_amount) : 0,
      notes: notes ?? '',
    },
  });
  res.json(fund);
}));

// PUT /api/entrusted-funds/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.entrustedFund.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Entrusted fund not found' }); return; }

  const { name, target_amount, notes, closed } = req.body;
  const data: any = {};
  if (name !== undefined) data.name = String(name).trim();
  if (target_amount !== undefined && !isNaN(Number(target_amount))) data.target_amount = Number(target_amount);
  if (notes !== undefined) data.notes = notes;
  if (closed !== undefined) data.closed = Boolean(closed);

  const fund = await prisma.entrustedFund.update({ where: { id }, data });
  res.json(fund);
}));

// DELETE /api/entrusted-funds/:id — blocked if any transaction references it
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.entrustedFund.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Entrusted fund not found' }); return; }

  const usedCount = await prisma.transaction.count({ where: { entrusted_fund_id: id } });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: fund has ${usedCount} transaction(s). Close it instead.` });
    return;
  }

  await prisma.entrustedFund.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
