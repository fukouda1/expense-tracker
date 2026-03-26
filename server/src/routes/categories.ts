import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] });
  res.json(categories);
});

router.post('/reorder', async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  for (let i = 0; i < ids.length; i++) {
    await prisma.category.update({ where: { id: ids[i] }, data: { sort_order: i } });
  }
  res.json({ ok: true });
});

router.post('/', async (req, res) => {
  const { name, icon, color, type } = req.body;
  const cat = await prisma.category.create({ data: { name, icon, color, type } });
  res.json(cat);
});

router.put('/:id', async (req, res) => {
  const { name, icon, color, type, active } = req.body;
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (icon !== undefined) data.icon = icon;
  if (color !== undefined) data.color = color;
  if (type !== undefined) data.type = type;
  if (active !== undefined) data.active = active;
  const cat = await prisma.category.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(cat);
});

// PATCH /api/categories/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.category.update({
    where: { id },
    data: { active: !cat.active },
  });
  res.json(updated);
});

// POST /api/categories/merge
router.post('/merge', async (req, res) => {
  const { sourceId, targetId } = req.body as { sourceId: number; targetId: number };
  if (!sourceId || !targetId || sourceId === targetId) {
    res.status(400).json({ error: 'Invalid sourceId or targetId' });
    return;
  }
  // Protect system categories
  const PROTECTED_NAMES = ['Lent Money', 'Lent Payment', 'Debt', 'Debt Payment'];
  const sourceCat = await prisma.category.findUnique({ where: { id: sourceId } });
  if (sourceCat && PROTECTED_NAMES.includes(sourceCat.name)) {
    res.status(400).json({ error: `Cannot merge: "${sourceCat.name}" is a system category used by the Debt Tracker` });
    return;
  }
  // Update transactions
  const txResult = await prisma.transaction.updateMany({
    where: { category_id: sourceId },
    data: { category_id: targetId },
  });
  // Update budgets
  await prisma.budget.updateMany({
    where: { category_id: sourceId },
    data: { category_id: targetId },
  });
  // Update recurring transactions
  await prisma.recurringTransaction.updateMany({
    where: { category_id: sourceId },
    data: { category_id: targetId },
  });
  // Update tags that are category-specific
  await prisma.tag.updateMany({
    where: { category_id: sourceId },
    data: { category_id: targetId },
  });
  // Delete source category
  await prisma.category.delete({ where: { id: sourceId } });
  res.json({ merged: txResult.count });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  // Protected categories required by Debt Tracker
  const PROTECTED_NAMES = ['Lent Money', 'Lent Payment', 'Debt', 'Debt Payment'];
  const cat = await prisma.category.findUnique({ where: { id } });
  if (cat && PROTECTED_NAMES.includes(cat.name)) {
    res.status(400).json({ error: `Cannot delete: "${cat.name}" is a system category used by the Debt Tracker` });
    return;
  }
  const usedCount = await prisma.transaction.count({ where: { category_id: id } });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: used in ${usedCount} transaction(s)` });
    return;
  }
  await prisma.category.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
