import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] });
  res.json(tags);
});

router.post('/reorder', async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  for (let i = 0; i < ids.length; i++) {
    await prisma.tag.update({ where: { id: ids[i] }, data: { sort_order: i } });
  }
  res.json({ ok: true });
});

router.post('/', async (req, res) => {
  const { name, color, category_id } = req.body;
  const tag = await prisma.tag.create({
    data: { name, color, category_id: category_id ?? null },
  });
  res.json(tag);
});

router.put('/:id', async (req, res) => {
  const { name, color, category_id, active } = req.body;
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;
  if (category_id !== undefined) data.category_id = category_id;
  if (active !== undefined) data.active = active;
  const tag = await prisma.tag.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(tag);
});

// PATCH /api/tags/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.tag.update({
    where: { id },
    data: { active: !tag.active },
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const usedCount = await prisma.transactionTag.count({ where: { tag_id: id } });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: used in ${usedCount} transaction(s)` });
    return;
  }
  await prisma.tag.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
