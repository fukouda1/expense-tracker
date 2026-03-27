import { Router } from 'express';
import prisma from '../utils/db.js';
import { asyncHandler, round2 } from '../utils/asyncHandler.js';

const router = Router();

// GET /api/analytics/today
router.get('/today', asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: 'income', date: { startsWith: today } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: 'expense', date: { startsWith: today } }, _sum: { amount: true } }),
  ]);
  res.json({
    income: round2(income._sum.amount ?? 0),
    expense: round2(expense._sum.amount ?? 0),
  });
}));

// GET /api/analytics/weekly
router.get('/weekly', asyncHandler(async (_req, res) => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const startStr = start.toISOString().slice(0, 10);

  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: 'income', date: { gte: startStr } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: 'expense', date: { gte: startStr } }, _sum: { amount: true } }),
  ]);
  res.json({
    income: round2(income._sum.amount ?? 0),
    expense: round2(expense._sum.amount ?? 0),
  });
}));

// GET /api/analytics/monthly?month=YYYY-MM
router.get('/monthly', asyncHandler(async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month must be in YYYY-MM format' }); return;
  }
  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: 'income', date: { startsWith: month } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: 'expense', date: { startsWith: month } }, _sum: { amount: true } }),
  ]);
  res.json({
    income: round2(income._sum.amount ?? 0),
    expense: round2(expense._sum.amount ?? 0),
  });
}));

// GET /api/analytics/categories?from=&to=
router.get('/categories', asyncHandler(async (req, res) => {
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
    const total = round2(r._sum.amount ?? 0);
    return {
      category_id: r.category_id,
      category_name: cat?.name ?? 'Unknown',
      category_icon: cat?.icon ?? '📦',
      category_color: cat?.color ?? '#6b7280',
      total,
      count: r._count,
      percentage: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
    };
  }));
}));

// GET /api/analytics/trend?months=12
router.get('/trend', asyncHandler(async (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 60);
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
    total_income: round2(data.total_income),
    total_expense: round2(data.total_expense),
    net: round2(data.total_income - data.total_expense),
  })));
}));

// GET /api/analytics/daily?month=YYYY-MM
router.get('/daily', asyncHandler(async (req, res) => {
  const month = req.query.month as string;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month must be in YYYY-MM format' }); return;
  }

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

  res.json(
    Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        total_income: round2(data.total_income),
        total_expense: round2(data.total_expense),
        total_transfer: round2(data.total_transfer),
        count: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  );
}));

// GET /api/analytics/weekly-comparison
router.get('/weekly-comparison', asyncHandler(async (_req, res) => {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const [thisWeek, lastWeek] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: 'expense', date: { gte: thisWeekStart.toISOString().slice(0, 10) } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        type: 'expense',
        date: { gte: lastWeekStart.toISOString().slice(0, 10), lt: thisWeekStart.toISOString().slice(0, 10) },
      },
      _sum: { amount: true },
    }),
  ]);
  res.json({
    thisWeek: round2(thisWeek._sum.amount ?? 0),
    lastWeek: round2(lastWeek._sum.amount ?? 0),
  });
}));

// GET /api/analytics/top-categories?from=&to=&limit=5
router.get('/top-categories', asyncHandler(async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const limit = Math.min(Number(req.query.limit) || 5, 50);

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
    const total = round2(r._sum.amount ?? 0);
    return {
      category_id: r.category_id,
      category_name: cat?.name ?? 'Unknown',
      category_icon: cat?.icon ?? '📦',
      category_color: cat?.color ?? '#6b7280',
      total,
      count: r._count,
      percentage: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
    };
  }));
}));

// GET /api/analytics/balances — fixed: single query per account instead of N+1
router.get('/balances', asyncHandler(async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });

  // Single grouped query instead of 4 queries per account
  const [byAccount, transferIn] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['account_id', 'type'],
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['to_account_id', 'type'],
      where: { type: 'transfer', to_account_id: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  // Build lookup maps
  type AmountMap = Map<number, { income: number; expense: number; transferOut: number }>;
  const amountMap: AmountMap = new Map();
  for (const row of byAccount) {
    const id = row.account_id;
    if (!amountMap.has(id)) amountMap.set(id, { income: 0, expense: 0, transferOut: 0 });
    const entry = amountMap.get(id)!;
    const amt = row._sum.amount ?? 0;
    if (row.type === 'income') entry.income += amt;
    else if (row.type === 'expense') entry.expense += amt;
    else if (row.type === 'transfer') entry.transferOut += amt;
  }

  const transferInMap = new Map<number, number>();
  for (const row of transferIn) {
    if (row.to_account_id != null) {
      transferInMap.set(row.to_account_id, (transferInMap.get(row.to_account_id) ?? 0) + (row._sum.amount ?? 0));
    }
  }

  res.json(accounts.map(a => {
    const am = amountMap.get(a.id) ?? { income: 0, expense: 0, transferOut: 0 };
    const balance = round2(
      a.initial_balance + am.income - am.expense - am.transferOut + (transferInMap.get(a.id) ?? 0)
    );
    return {
      account_id: a.id,
      account_name: a.name,
      account_color: a.color,
      balance,
    };
  }));
}));

// GET /api/analytics/income-categories?from=&to=
router.get('/income-categories', asyncHandler(async (req, res) => {
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
    const total = round2(r._sum.amount ?? 0);
    return {
      category_id: r.category_id,
      category_name: cat?.name ?? 'Unknown',
      category_icon: cat?.icon ?? '📦',
      category_color: cat?.color ?? '#6b7280',
      total,
      count: r._count,
      percentage: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
    };
  }));
}));

// GET /api/analytics/account-analysis?from=&to=
// Fixed: single groupBy instead of N+1 queries per account
router.get('/account-analysis', asyncHandler(async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });
  const dateFilter = from && to ? { date: { gte: from, lte: to } } : {};

  const grouped = await prisma.transaction.groupBy({
    by: ['account_id', 'type'],
    where: dateFilter,
    _sum: { amount: true },
    _count: true,
  });

  const map = new Map<number, { income: number; expense: number; count: number }>();
  for (const row of grouped) {
    if (!map.has(row.account_id)) map.set(row.account_id, { income: 0, expense: 0, count: 0 });
    const entry = map.get(row.account_id)!;
    const amt = row._sum.amount ?? 0;
    entry.count += row._count;
    if (row.type === 'income') entry.income += amt;
    else if (row.type === 'expense') entry.expense += amt;
  }

  const result = accounts.map(a => {
    const data = map.get(a.id) ?? { income: 0, expense: 0, count: 0 };
    const inc = round2(data.income);
    const exp = round2(data.expense);
    return { account_id: a.id, account_name: a.name, account_icon: a.icon, account_color: a.color, income: inc, expense: exp, net: round2(inc - exp), count: data.count };
  });

  res.json(result.filter(a => a.count > 0));
}));

// GET /api/analytics/spending-alerts — server-side computation of weekly category overspend
router.get('/spending-alerts', asyncHandler(async (_req, res) => {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const fourWeeksAgo = new Date(thisWeekStart);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const thisWeekFrom = thisWeekStart.toISOString().slice(0, 10);
  const thisWeekTo = now.toISOString().slice(0, 16);
  const fourWeeksFrom = fourWeeksAgo.toISOString().slice(0, 10);
  const fourWeeksTo = new Date(thisWeekStart.getTime() - 1).toISOString().slice(0, 10) + 'T23:59';

  const [thisWeekGroups, prevGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['category_id'],
      where: { type: 'expense', date: { gte: thisWeekFrom, lte: thisWeekTo }, category_id: { not: null } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['category_id'],
      where: { type: 'expense', date: { gte: fourWeeksFrom, lte: fourWeeksTo }, category_id: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const categories = await prisma.category.findMany({ select: { id: true, name: true, icon: true } });
  const catMap = new Map(categories.map(c => [c.id, c]));
  const prevMap = new Map(prevGroups.map(g => [g.category_id!, round2(g._sum.amount ?? 0)]));

  const alerts = thisWeekGroups
    .map(g => {
      const catId = g.category_id!;
      const thisWeek = round2(g._sum.amount ?? 0);
      const prev4Total = prevMap.get(catId) ?? 0;
      const weeklyAvg = round2(prev4Total / 4);
      if (weeklyAvg <= 0) return null;
      const pctAbove = Math.round(((thisWeek - weeklyAvg) / weeklyAvg) * 100);
      if (pctAbove <= 30) return null;
      const cat = catMap.get(catId);
      return { categoryId: catId, categoryName: cat?.name ?? 'Unknown', categoryIcon: cat?.icon ?? '📦', thisWeek, weeklyAvg, pctAbove };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.pctAbove - a.pctAbove);

  res.json(alerts);
}));

// GET /api/analytics/debt-transactions — only debt-category transactions (small subset)
router.get('/debt-transactions', asyncHandler(async (_req, res) => {
  const debtCats = await prisma.category.findMany({
    where: { name: { in: ['Lent Money', 'Lent Payment', 'Debt', 'Debt Payment'] } },
    select: { id: true, name: true },
  });
  if (debtCats.length === 0) { res.json([]); return; }

  const catIds = debtCats.map(c => c.id);
  const catIdToName = new Map(debtCats.map(c => [c.id, c.name]));

  const txs = await prisma.transaction.findMany({
    where: { category_id: { in: catIds } },
    include: { account: true },
    orderBy: { date: 'desc' },
  });

  res.json(txs.map(t => ({
    id: t.id, amount: t.amount, type: t.type, date: t.date, notes: t.notes,
    category_id: t.category_id, category_name: catIdToName.get(t.category_id!) ?? null,
    account_id: t.account_id, account_name: t.account.name,
  })));
}));

// GET /api/analytics/debt-summary — lightweight alternative to fetching all transactions
router.get('/debt-summary', asyncHandler(async (_req, res) => {
  const debtCats = await prisma.category.findMany({
    where: { name: { in: ['Lent Money', 'Lent Payment', 'Debt', 'Debt Payment'] } },
    select: { id: true, name: true },
  });
  const catMap = new Map(debtCats.map(c => [c.name, c.id]));

  const sumByCat = async (catName: string): Promise<number> => {
    const id = catMap.get(catName);
    if (!id) return 0;
    const agg = await prisma.transaction.aggregate({ where: { category_id: id }, _sum: { amount: true } });
    return agg._sum.amount ?? 0;
  };

  const [lent, returned, borrowed, paid] = await Promise.all([
    sumByCat('Lent Money'),
    sumByCat('Lent Payment'),
    sumByCat('Debt'),
    sumByCat('Debt Payment'),
  ]);

  res.json({
    theyOwe: round2(Math.max(0, lent - returned)),
    iOwe: round2(Math.max(0, borrowed - paid)),
    lent: round2(lent),
    returned: round2(returned),
    borrowed: round2(borrowed),
    paid: round2(paid),
  });
}));

export default router;
