/**
 * Minimal dev fixture seed — creates just enough data to test features without
 * needing a real XLSX backup. Idempotent: safe to re-run (upserts by name).
 *
 * Run with: `cd server && npx tsx src/seedDev.ts`
 * Or the npm alias:   `cd server && npm run seed:dev`
 *
 * Produces:
 *  - 5 accounts (mix of active/inactive, different initial balances)
 *  - 8 categories (mix of expense/income)
 *  - 2 tags
 *  - 1 budget
 *  - 2 recurring transactions (one auto_create=true, one reminder-only)
 *  - 50 transactions spread across the last 60 days
 */

import prisma from './utils/db.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 16).replace('T', 'T'); // YYYY-MM-DDTHH:mm
}

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log('Seeding dev fixtures...');

  // Accounts
  const accountDefs = [
    { name: 'Cash',           icon: '💵', color: '#22c55e', initial_balance: 5000, active: true,  sort_order: 0 },
    { name: 'Bank',           icon: '🏦', color: '#3b82f6', initial_balance: 25000, active: true,  sort_order: 1 },
    { name: 'GCash',          icon: '📱', color: '#0ea5e9', initial_balance: 1500, active: true,  sort_order: 2 },
    { name: 'Savings',        icon: '💰', color: '#10b981', initial_balance: 100000, active: true,  sort_order: 3 },
    { name: 'Old Wallet',     icon: '👛', color: '#6b7280', initial_balance: 0,    active: false, sort_order: 4 },
  ];
  const accounts: { id: number; name: string }[] = [];
  for (const a of accountDefs) {
    const acc = await prisma.account.upsert({
      where: { name: a.name },
      create: a,
      update: a,
    });
    accounts.push({ id: acc.id, name: acc.name });
  }
  console.log(`  ✓ ${accounts.length} accounts`);

  // Categories
  const categoryDefs = [
    { name: 'Food',      icon: '🍔', color: '#ef4444', type: 'expense', sort_order: 0 },
    { name: 'Transport', icon: '🚌', color: '#3b82f6', type: 'expense', sort_order: 1 },
    { name: 'Bills',     icon: '💡', color: '#8b5cf6', type: 'expense', sort_order: 2 },
    { name: 'Grocery',   icon: '🛒', color: '#22c55e', type: 'expense', sort_order: 3 },
    { name: 'Shopping',  icon: '🛍️', color: '#a855f7', type: 'expense', sort_order: 4 },
    { name: 'Others',    icon: '📦', color: '#6b7280', type: 'expense', sort_order: 5 },
    { name: 'Salary',    icon: '💵', color: '#10b981', type: 'income',  sort_order: 6 },
    { name: 'Bonus',     icon: '🎁', color: '#22c55e', type: 'income',  sort_order: 7 },
  ];
  const categories: { id: number; name: string; type: string }[] = [];
  for (const c of categoryDefs) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      create: c,
      update: c,
    });
    categories.push({ id: cat.id, name: cat.name, type: cat.type });
  }
  console.log(`  ✓ ${categories.length} categories`);

  // Tags
  const tagDefs = [
    { name: 'recurring', color: '#3b82f6', sort_order: 0 },
    { name: 'work',      color: '#f59e0b', sort_order: 1 },
  ];
  for (const t of tagDefs) {
    await prisma.tag.upsert({ where: { name: t.name }, create: t, update: t });
  }
  console.log(`  ✓ ${tagDefs.length} tags`);

  // Budget
  const foodCat = categories.find(c => c.name === 'Food')!;
  const currentMonth = new Date().toISOString().slice(0, 7);
  await prisma.budget.upsert({
    where: { category_id_month: { category_id: foodCat.id, month: currentMonth } },
    create: { category_id: foodCat.id, amount: 5000, month: currentMonth },
    update: { amount: 5000 },
  });
  console.log('  ✓ 1 budget');

  // Recurring
  await prisma.recurringTransaction.deleteMany({ where: { notes: { contains: '[dev-seed]' } } });
  const bills = categories.find(c => c.name === 'Bills')!;
  const bank = accounts.find(a => a.name === 'Bank')!;
  await prisma.recurringTransaction.create({
    data: {
      amount: 1500, type: 'expense', category_id: bills.id, account_id: bank.id,
      notes: 'Electricity [dev-seed]', recurrence_type: 'monthly',
      next_date: new Date().toISOString().slice(0, 10),
      active: true, auto_create: true,
    },
  });
  await prisma.recurringTransaction.create({
    data: {
      amount: 500, type: 'expense', category_id: bills.id, account_id: bank.id,
      notes: 'Internet [dev-seed]', recurrence_type: 'monthly',
      next_date: new Date().toISOString().slice(0, 10),
      active: true, auto_create: false,
    },
  });
  console.log('  ✓ 2 recurring (1 auto, 1 reminder)');

  // 50 transactions spread across last 60 days
  const activeAccounts = accounts.slice(0, 4);
  const expenseCats = categories.filter(c => c.type === 'expense');
  const incomeCats = categories.filter(c => c.type === 'income');
  await prisma.transactionTag.deleteMany({ where: { transaction: { notes: { contains: '[dev-seed]' } } } });
  await prisma.transaction.deleteMany({ where: { notes: { contains: '[dev-seed]' } } });
  for (let i = 0; i < 50; i++) {
    const isIncome = Math.random() < 0.15; // ~15% income
    const cat = isIncome ? rand(incomeCats) : rand(expenseCats);
    await prisma.transaction.create({
      data: {
        amount: isIncome ? randInt(2000, 30000) : randInt(50, 2000),
        type: isIncome ? 'income' : 'expense',
        category_id: cat.id,
        account_id: rand(activeAccounts).id,
        date: daysAgo(randInt(0, 60)),
        notes: `Seeded entry #${i + 1} [dev-seed]`,
      },
    });
  }
  console.log('  ✓ 50 transactions');

  console.log('Done. Total in DB:');
  console.log(`  accounts=${await prisma.account.count()}`);
  console.log(`  categories=${await prisma.category.count()}`);
  console.log(`  transactions=${await prisma.transaction.count()}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
