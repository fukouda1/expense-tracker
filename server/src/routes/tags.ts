import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
  res.json(tags);
});

router.post('/', async (req, res) => {
  const { name, color } = req.body;
  const tag = await prisma.tag.create({ data: { name, color } });
  res.json(tag);
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
