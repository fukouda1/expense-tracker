import { Router } from 'express';
import prisma from '../utils/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const PROTECTED_NAMES = ['Lent Money', 'Lent Payment', 'Debt', 'Debt Payment'];
const VALID_TYPES = ['income', 'expense', 'transfer'];

router.get('/', asyncHandler(async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });

  // One-time fix: initialize sort_order for rows that are all 0 (imported/legacy data)
  const allZero = categories.length > 1 && categories.every(c => c.sort_order === 0);
  if (allZero) {
    for (let i = 0; i < categories.length; i++) {
      await prisma.category.update({ where: { id: categories[i].id }, data: { sort_order: i } });
      categories[i].sort_order = i;
    }
  }

  res.json(categories);
}));

router.post('/reorder', asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array' }); return;
  }
  for (let i = 0; i < ids.length; i++) {
    await prisma.category.update({ where: { id: Number(ids[i]) }, data: { sort_order: i } });
  }
  res.json({ ok: true });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, icon, color, type } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }); return;
  }
  const maxOrder = await prisma.category.aggregate({ _max: { sort_order: true } });
  const sort_order = (maxOrder._max.sort_order ?? -1) + 1;
  const cat = await prisma.category.create({ data: { name: name.trim(), icon, color, type, sort_order } });
  res.json(cat);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Category not found' }); return; }

  const { name, icon, color, type, active } = req.body;
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }); return;
  }

  const data: any = {};
  if (name !== undefined) data.name = String(name).trim();
  if (icon !== undefined) data.icon = icon;
  if (color !== undefined) data.color = color;
  if (type !== undefined) data.type = type;
  if (active !== undefined) data.active = Boolean(active);

  const cat = await prisma.category.update({ where: { id }, data });
  res.json(cat);
}));

// PATCH /api/categories/:id/toggle
router.patch('/:id/toggle', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) { res.status(404).json({ error: 'Category not found' }); return; }

  const updated = await prisma.category.update({ where: { id }, data: { active: !cat.active } });
  res.json(updated);
}));

// POST /api/categories/merge
router.post('/merge', asyncHandler(async (req, res) => {
  const { sourceId, targetId } = req.body;
  if (!sourceId || !targetId) {
    res.status(400).json({ error: 'sourceId and targetId are required' }); return;
  }
  if (Number(sourceId) === Number(targetId)) {
    res.status(400).json({ error: 'sourceId and targetId must be different' }); return;
  }

  const sourceCat = await prisma.category.findUnique({ where: { id: Number(sourceId) } });
  if (!sourceCat) { res.status(404).json({ error: 'Source category not found' }); return; }
  if (PROTECTED_NAMES.includes(sourceCat.name)) {
    res.status(400).json({ error: `Cannot merge: "${sourceCat.name}" is a system category` }); return;
  }

  const targetCat = await prisma.category.findUnique({ where: { id: Number(targetId) } });
  if (!targetCat) { res.status(404).json({ error: 'Target category not found' }); return; }

  // Append old category name to notes for affected transactions
  const affectedTxs = await prisma.transaction.findMany({ where: { category_id: Number(sourceId) }, select: { id: true, notes: true } });
  for (const tx of affectedTxs) {
    const suffix = `(${sourceCat.name})`;
    const newNotes = tx.notes ? `${tx.notes} ${suffix}` : suffix;
    await prisma.transaction.update({ where: { id: tx.id }, data: { notes: newNotes } });
  }
  const txResult = await prisma.transaction.updateMany({
    where: { category_id: Number(sourceId) }, data: { category_id: Number(targetId) },
  });
  await prisma.budget.updateMany({
    where: { category_id: Number(sourceId) }, data: { category_id: Number(targetId) },
  });
  await prisma.recurringTransaction.updateMany({
    where: { category_id: Number(sourceId) }, data: { category_id: Number(targetId) },
  });
  await prisma.tag.updateMany({
    where: { category_id: Number(sourceId) }, data: { category_id: Number(targetId) },
  });
  await prisma.category.delete({ where: { id: Number(sourceId) } });
  res.json({ merged: txResult.count });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) { res.status(404).json({ error: 'Category not found' }); return; }
  if (PROTECTED_NAMES.includes(cat.name)) {
    res.status(400).json({ error: `Cannot delete: "${cat.name}" is a system category used by the Debt Tracker` }); return;
  }

  const usedCount = await prisma.transaction.count({ where: { category_id: id } });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: used in ${usedCount} transaction(s)` }); return;
  }
  await prisma.category.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
