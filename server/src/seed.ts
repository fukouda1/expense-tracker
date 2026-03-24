import prisma from './utils/db.js';
import { readFileSync } from 'fs';
import { parseCsvAndImport } from './services/csvImporter.js';

const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: '🍔', color: '#ef4444', type: 'expense' },
  { name: 'Food - Work', icon: '🍱', color: '#f97316', type: 'expense' },
  { name: 'Transport', icon: '🚌', color: '#3b82f6', type: 'expense' },
  { name: 'Transport - Work', icon: '🚆', color: '#2563eb', type: 'expense' },
  { name: 'Bills - Rent', icon: '🏠', color: '#8b5cf6', type: 'expense' },
  { name: 'Bills - Internet', icon: '📡', color: '#6366f1', type: 'expense' },
  { name: 'Bills - Dental', icon: '🦷', color: '#ec4899', type: 'expense' },
  { name: 'Food Allowance', icon: '🍚', color: '#f59e0b', type: 'expense' },
  { name: 'Medicine', icon: '💊', color: '#14b8a6', type: 'expense' },
  { name: 'Grocery', icon: '🛒', color: '#22c55e', type: 'expense' },
  { name: 'Shopping', icon: '🛍️', color: '#a855f7', type: 'expense' },
  { name: 'Electronics', icon: '📱', color: '#0ea5e9', type: 'expense' },
  { name: 'Social', icon: '🎉', color: '#f43f5e', type: 'expense' },
  { name: 'Fitness', icon: '💪', color: '#10b981', type: 'expense' },
  { name: 'Pet Expenses', icon: '🐾', color: '#d97706', type: 'expense' },
  { name: 'Clothing', icon: '👕', color: '#7c3aed', type: 'expense' },
  { name: 'Others', icon: '📦', color: '#6b7280', type: 'expense' },
  { name: 'Salary', icon: '💵', color: '#10b981', type: 'income' },
  { name: 'Bonus', icon: '🎁', color: '#22c55e', type: 'income' },
  { name: 'Bank Interest', icon: '🏦', color: '#0ea5e9', type: 'income' },
  { name: 'Cash Back', icon: '💸', color: '#14b8a6', type: 'income' },
];

const DEFAULT_ACCOUNTS = [
  { name: 'Cash', icon: '💵', color: '#22c55e', initial_balance: 0 },
  { name: 'Bank - BOC', icon: '🏦', color: '#3b82f6', initial_balance: 0 },
  { name: 'Bank - Metrobank', icon: '🏦', color: '#8b5cf6', initial_balance: 0 },
  { name: 'Gcash', icon: '📱', color: '#0ea5e9', initial_balance: 0 },
  { name: 'Seabank', icon: '🌊', color: '#14b8a6', initial_balance: 0 },
];

async function seed() {
  console.log('Seeding database...');

  // Create default categories
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { name: cat.name },
      create: cat,
      update: {},
    });
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} categories`);

  // Create default accounts
  for (const acc of DEFAULT_ACCOUNTS) {
    await prisma.account.upsert({
      where: { name: acc.name },
      create: acc,
      update: {},
    });
  }
  console.log(`Seeded ${DEFAULT_ACCOUNTS.length} accounts`);

  // Import CSV if provided as argument
  const csvPath = process.argv[2];
  if (csvPath) {
    console.log(`Importing CSV from: ${csvPath}`);
    const csvContent = readFileSync(csvPath, 'utf-8');
    const result = await parseCsvAndImport(csvContent);
    console.log(`Import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`);
    if (result.errors.length > 0) {
      console.log('Errors:', result.errors.slice(0, 10));
    }
  }

  console.log('Seed complete!');
}

seed()
  .catch(console.error)
  .finally(() => process.exit());
