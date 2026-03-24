import { Router } from 'express';
import prisma from '../utils/db.js';

const router = Router();

// GET /api/analytics/today
router.get('/today', async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const income = await prisma.transaction.aggregate({
    where: { type: 'income', date: { startsWith: today } },
    _sum: { amount: true },
  });
  const expense = await prisma.transaction.aggregate({
    where: { type: 'expense', date: { startsWith: today } },
    _sum: { amount: true },
  });
  res.json({ income: income._sum.amount ?? 0, expense: expense._sum.amount ?? 0 });
});

// GET /api/analytics/weekly
router.get('/weekly', async (_req, res) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  const startStr = start.toISOString().slice(0, 10);

  const income = await prisma.transaction.aggregate({
    where: { type: 'income', date: { gte: startStr } },
    _sum: { amount: true },
  });
  const expense = await prisma.transaction.aggregate({
    where: { type: 'expense', date: { gte: startStr } },
    _sum: { amount: true },
  });
  res.json({ income: income._sum.amount ?? 0, expense: expense._sum.amount ?? 0 });
});

// GET /api/analytics/monthly?month=YYYY-MM
router.get('/monthly', async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const income = await prisma.transaction.aggregate({
    where: { type: 'income', date: { startsWith: month } },
    _sum: { amount: true },
  });
  const expense = await prisma.transaction.aggregate({
    where: { type: 'expense', date: { startsWith: month } },
    _sum: { amount: true },
  });
  res.json({ income: income._sum.amount ?? 0, expense: expense._sum.amount ?? 0 });
});

// GET /api/analytics/categories?from=&to=
router.get('/categories', async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;

  const results = await prisma.transaction.groupBy({
    by: ['category_id'],
    where: { type: 'expense', date: { gte: from, lte: to }, category_id: { not: null } },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: 'desc' } },
  });

  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map(c => [c.id, c]));
  const grandTotal = results.reduce((s, r) => s + (r._sum.amount ?? 0), 0);

  res.json(results.map(r => {
    const cat = catMap.get(r.category_id!);
    const total = r._sum.amount ?? 0;
    return {
      category_id: r.category_id,
      category_name: cat?.name ?? 'Unknown',
      category_icon: cat?.icon ?? '📦',
      category_color: cat?.color ?? '#6b7280',
      total,
      count: r._count,
      percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
    };
  }));
});

// GET /api/analytics/trend?months=12
router.get('/trend', async (req, res) => {
  const months = Number(req.query.months) || 12;
  const transactions = await prisma.transaction.findMany({
    where: { type: { in: ['income', 'expense'] } },
    select: { date: true, type: true, amount: true },
    orderBy: { date: 'desc' },
  });

  const monthMap = new Map<string, { total_income: number; total_expense: number }>();
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    if (!monthMap.has(m)) monthMap.set(m, { total_income: 0, total_expense: 0 });
    const entry = monthMap.get(m)!;
    if (t.type === 'income') entry.total_income += t.amount;
    else entry.total_expense += t.amount;
  }

  const sorted = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, months)
    .reverse();

  res.json(sorted.map(([month, data]) => ({
    month,
    ...data,
    net: data.total_income - data.total_expense,
  })));
});

// GET /api/analytics/daily?month=YYYY-MM
router.get('/daily', async (req, res) => {
  const month = req.query.month as string;
  const transactions = await prisma.transaction.findMany({
    where: { date: { startsWith: month } },
    select: { date: true, type: true, amount: true },
  });

  const dayMap = new Map<string, { total_income: number; total_expense: number; total_transfer: number; count: number }>();
  for (const t of transactions) {
    const d = t.date.slice(0, 10);
    if (!dayMap.has(d)) dayMap.set(d, { total_income: 0, total_expense: 0, total_transfer: 0, count: 0 });
    const entry = dayMap.get(d)!;
    entry.count++;
    if (t.type === 'income') entry.total_income += t.amount;
    else if (t.type === 'expense') entry.total_expense += t.amount;
    else entry.total_transfer += t.amount;
  }

  res.json(Array.from(dayMap.entries()).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date)));
});

// GET /api/analytics/weekly-comparison
router.get('/weekly-comparison', async (_req, res) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - dayOfWeek);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const thisWeek = await prisma.transaction.aggregate({
    where: { type: 'expense', date: { gte: thisWeekStart.toISOString().slice(0, 10) } },
    _sum: { amount: true },
  });
  const lastWeek = await prisma.transaction.aggregate({
    where: {
      type: 'expense',
      date: { gte: lastWeekStart.toISOString().slice(0, 10), lt: thisWeekStart.toISOString().slice(0, 10) },
    },
    _sum: { amount: true },
  });
  res.json({ thisWeek: thisWeek._sum.amount ?? 0, lastWeek: lastWeek._sum.amount ?? 0 });
});

// GET /api/analytics/top-categories?from=&to=&limit=5
router.get('/top-categories', async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const limit = Number(req.query.limit) || 5;

  const results = await prisma.transaction.groupBy({
    by: ['category_id'],
    where: { type: 'expense', date: { gte: from, lte: to }, category_id: { not: null } },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: 'desc' } },
    take: limit,
  });

  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map(c => [c.id, c]));
  const grandTotal = results.reduce((s, r) => s + (r._sum.amount ?? 0), 0);

  res.json(results.map(r => {
    const cat = catMap.get(r.category_id!);
    const total = r._sum.amount ?? 0;
    return {
      category_id: r.category_id,
      category_name: cat?.name ?? 'Unknown',
      category_icon: cat?.icon ?? '📦',
      category_color: cat?.color ?? '#6b7280',
      total,
      count: r._count,
      percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
    };
  }));
});

// GET /api/analytics/balances
router.get('/balances', async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });

  const result = await Promise.all(accounts.map(async a => {
    const income = await prisma.transaction.aggregate({
      where: { account_id: a.id, type: 'income' }, _sum: { amount: true },
    });
    const expense = await prisma.transaction.aggregate({
      where: { account_id: a.id, type: 'expense' }, _sum: { amount: true },
    });
    const transferOut = await prisma.transaction.aggregate({
      where: { account_id: a.id, type: 'transfer' }, _sum: { amount: true },
    });
    const transferIn = await prisma.transaction.aggregate({
      where: { to_account_id: a.id, type: 'transfer' }, _sum: { amount: true },
    });

    const balance = a.initial_balance
      + (income._sum.amount ?? 0)
      - (expense._sum.amount ?? 0)
      - (transferOut._sum.amount ?? 0)
      + (transferIn._sum.amount ?? 0);

    return {
      account_id: a.id,
      account_name: a.name,
      account_color: a.color,
      balance,
    };
  }));

  res.json(result);
});

// GET /api/analytics/income-categories?from=&to=
router.get('/income-categories', async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;

  const results = await prisma.transaction.groupBy({
    by: ['category_id'],
    where: { type: 'income', date: { gte: from, lte: to }, category_id: { not: null } },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: 'desc' } },
  });

  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map(c => [c.id, c]));
  const grandTotal = results.reduce((s, r) => s + (r._sum.amount ?? 0), 0);

  res.json(results.map(r => {
    const cat = catMap.get(r.category_id!);
    const total = r._sum.amount ?? 0;
    return {
      category_id: r.category_id,
      category_name: cat?.name ?? 'Unknown',
      category_icon: cat?.icon ?? '📦',
      category_color: cat?.color ?? '#6b7280',
      total,
      count: r._count,
      percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
    };
  }));
});

// GET /api/analytics/account-analysis?from=&to=
router.get('/account-analysis', async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });

  const result = await Promise.all(accounts.map(async a => {
    const dateFilter = from && to ? { gte: from, lte: to } : undefined;
    const income = await prisma.transaction.aggregate({
      where: { account_id: a.id, type: 'income', ...(dateFilter ? { date: dateFilter } : {}) },
      _sum: { amount: true },
    });
    const expense = await prisma.transaction.aggregate({
      where: { account_id: a.id, type: 'expense', ...(dateFilter ? { date: dateFilter } : {}) },
      _sum: { amount: true },
    });
    const txCount = await prisma.transaction.count({
      where: { account_id: a.id, ...(dateFilter ? { date: dateFilter } : {}) },
    });
    return {
      account_id: a.id,
      account_name: a.name,
      account_icon: a.icon,
      account_color: a.color,
      income: income._sum.amount ?? 0,
      expense: expense._sum.amount ?? 0,
      net: (income._sum.amount ?? 0) - (expense._sum.amount ?? 0),
      count: txCount,
    };
  }));

  res.json(result.filter(a => a.count > 0));
});

export default router;
