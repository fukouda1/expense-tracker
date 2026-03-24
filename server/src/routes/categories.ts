import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json(categories);
});

router.post('/', async (req, res) => {
  const { name, icon, color, type } = req.body;
  const cat = await prisma.category.create({ data: { name, icon, color, type } });
  res.json(cat);
});

router.put('/:id', async (req, res) => {
  const { name, icon, color, type } = req.body;
  const cat = await prisma.category.update({
    where: { id: Number(req.params.id) },
    data: { name, icon, color, type },
  });
  res.json(cat);
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const usedCount = await prisma.transaction.count({ where: { category_id: id } });
  if (usedCount > 0) {
    res.status(400).json({ error: `Cannot delete: used in ${usedCount} transaction(s)` });
    return;
  }
  await prisma.category.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
