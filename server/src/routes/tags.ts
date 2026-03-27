import { Router } from 'express';
import prisma from '../utils/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] });
  res.json(tags);
}));

router.post('/reorder', asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array' }); return;
  }
  for (let i = 0; i < ids.length; i++) {
    await prisma.tag.update({ where: { id: Number(ids[i]) }, data: { sort_order: i } });
  }
  res.json({ ok: true });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, color, category_id } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  const maxOrder = await prisma.tag.aggregate({ _max: { sort_order: true } });
  const sort_order = (maxOrder._max.sort_order ?? -1) + 1;
  const tag = await prisma.tag.create({
    data: { name: name.trim(), color, category_id: category_id ? Number(category_id) : null, sort_order },
  });
  res.json(tag);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.tag.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Tag not found' }); return; }

  const { name, color, category_id, active } = req.body;
  const data: any = {};
  if (name !== undefined) data.name = String(name).trim();
  if (color !== undefined) data.color = color;
  if (category_id !== undefined) data.category_id = category_id ? Number(category_id) : null;
  if (active !== undefined) data.active = Boolean(active);

  const tag = await prisma.tag.update({ where: { id }, data });
  res.json(tag);
}));

// PATCH /api/tags/:id/toggle
router.patch('/:id/toggle', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) { res.status(404).json({ error: 'Tag not found' }); return; }

  const updated = await prisma.tag.update({ where: { id }, data: { active: !tag.active } });
  res.json(updated);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const existing = await prisma.tag.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Tag not found' }); return; }

  const usedCount = await prisma.transactionTag.count({ where: { tag_id: id } });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: used in ${usedCount} transaction(s)` }); return;
  }
  await prisma.tag.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
