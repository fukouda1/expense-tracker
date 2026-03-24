import { Router } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../utils/db.js';

const router = Router();

// GET /api/export/pdf?month=YYYY-MM
router.get('/', async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split('-').map(Number);
  const monthName = new Date(year, mon - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Fetch data
  const transactions = await prisma.transaction.findMany({
    where: { date: { startsWith: month } },
    include: { category: true, account: true, to_account: true },
    orderBy: { date: 'asc' },
  });

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const transfer = transactions.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);

  // Category breakdown
  const catMap = new Map<string, { name: string; total: number; count: number }>();
  for (const t of transactions.filter(tx => tx.type === 'expense' && tx.category)) {
    const key = t.category!.name;
    const entry = catMap.get(key) ?? { name: key, total: 0, count: 0 };
    entry.total += t.amount;
    entry.count++;
    catMap.set(key, entry);
  }
  const categories = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

  // Budgets
  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
  });

  // Build PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=TraceCash_Report_${month}.pdf`);
  doc.pipe(res);

  // Title
  doc.fontSize(22).fillColor('#10b981').text('TraceCash', { align: 'center' });
  doc.fontSize(14).fillColor('#374151').text(`Financial Report — ${monthName}`, { align: 'center' });
  doc.moveDown(1.5);

  // Summary box
  doc.fontSize(12).fillColor('#111827').text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#374151');
  doc.text(`Total Income:    PHP ${income.toLocaleString('en', { minimumFractionDigits: 2 })}`);
  doc.text(`Total Expenses:  PHP ${expense.toLocaleString('en', { minimumFractionDigits: 2 })}`);
  doc.text(`Transfers:       PHP ${transfer.toLocaleString('en', { minimumFractionDigits: 2 })}`);
  doc.text(`Net Savings:     PHP ${(income - expense).toLocaleString('en', { minimumFractionDigits: 2 })}`);
  const savingsRate = income > 0 ? ((income - expense) / income * 100).toFixed(1) : '0.0';
  doc.text(`Savings Rate:    ${savingsRate}%`);
  doc.text(`Transactions:    ${transactions.length}`);
  doc.moveDown(1);

  // Category breakdown
  if (categories.length > 0) {
    doc.fontSize(12).fillColor('#111827').text('Expense Breakdown by Category', { underline: true });
    doc.moveDown(0.5);

    // Table header
    const col1 = 50, col2 = 250, col3 = 370, col4 = 440;
    doc.fontSize(9).fillColor('#6b7280');
    doc.text('Category', col1, doc.y, { continued: false });
    const headerY = doc.y - 12;
    doc.text('Amount', col2, headerY);
    doc.text('Count', col3, headerY);
    doc.text('%', col4, headerY);
    doc.moveTo(50, doc.y + 2).lineTo(520, doc.y + 2).stroke('#e5e7eb');
    doc.moveDown(0.3);

    doc.fontSize(9).fillColor('#374151');
    for (const cat of categories) {
      const pct = expense > 0 ? (cat.total / expense * 100).toFixed(1) : '0.0';
      const y = doc.y;
      doc.text(cat.name, col1, y);
      doc.text(`PHP ${cat.total.toLocaleString('en', { minimumFractionDigits: 2 })}`, col2, y);
      doc.text(String(cat.count), col3, y);
      doc.text(`${pct}%`, col4, y);
      if (doc.y > 700) { doc.addPage(); }
    }
    doc.moveDown(1);
  }

  // Budget vs Actual
  if (budgets.length > 0) {
    doc.fontSize(12).fillColor('#111827').text('Budget vs Actual', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#6b7280');
    const bCol1 = 50, bCol2 = 200, bCol3 = 310, bCol4 = 420;
    doc.text('Category', bCol1, doc.y);
    const bHeaderY = doc.y - 12;
    doc.text('Budget', bCol2, bHeaderY);
    doc.text('Actual', bCol3, bHeaderY);
    doc.text('Status', bCol4, bHeaderY);
    doc.moveTo(50, doc.y + 2).lineTo(520, doc.y + 2).stroke('#e5e7eb');
    doc.moveDown(0.3);

    for (const b of budgets) {
      const catName = b.category?.name ?? 'Overall';
      const spent = transactions.filter(t => t.type === 'expense' && (!b.category_id || t.category_id === b.category_id)).reduce((s, t) => s + t.amount, 0);
      const pct = b.amount > 0 ? Math.round(spent / b.amount * 100) : 0;
      const status = pct >= 100 ? 'OVER' : pct >= 80 ? 'WARNING' : 'OK';
      const y = doc.y;
      doc.fillColor('#374151').text(catName, bCol1, y);
      doc.text(`PHP ${b.amount.toLocaleString('en', { minimumFractionDigits: 2 })}`, bCol2, y);
      doc.text(`PHP ${spent.toLocaleString('en', { minimumFractionDigits: 2 })}`, bCol3, y);
      doc.fillColor(status === 'OVER' ? '#ef4444' : status === 'WARNING' ? '#f59e0b' : '#10b981').text(`${pct}% ${status}`, bCol4, y);
    }
    doc.moveDown(1);
  }

  // Transaction list (abbreviated)
  if (transactions.length > 0) {
    doc.addPage();
    doc.fontSize(12).fillColor('#111827').text('Transaction Details', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(8).fillColor('#6b7280');
    const tCol1 = 50, tCol2 = 130, tCol3 = 190, tCol4 = 290, tCol5 = 400;
    doc.text('Date', tCol1, doc.y);
    const tHeaderY = doc.y - 10;
    doc.text('Type', tCol2, tHeaderY);
    doc.text('Amount', tCol3, tHeaderY);
    doc.text('Category', tCol4, tHeaderY);
    doc.text('Account', tCol5, tHeaderY);
    doc.moveTo(50, doc.y + 2).lineTo(520, doc.y + 2).stroke('#e5e7eb');
    doc.moveDown(0.3);

    doc.fontSize(8).fillColor('#374151');
    for (const t of transactions) {
      if (doc.y > 720) { doc.addPage(); }
      const y = doc.y;
      const dateStr = t.date.slice(0, 10);
      const typeLabel = t.type === 'income' ? 'INC' : t.type === 'expense' ? 'EXP' : 'TRF';
      doc.text(dateStr, tCol1, y);
      doc.fillColor(t.type === 'income' ? '#10b981' : t.type === 'expense' ? '#ef4444' : '#3b82f6').text(typeLabel, tCol2, y);
      doc.fillColor('#374151').text(`PHP ${t.amount.toLocaleString('en', { minimumFractionDigits: 2 })}`, tCol3, y);
      doc.text(t.category?.name ?? '-', tCol4, y);
      doc.text(t.account.name, tCol5, y);
    }
  }

  // Footer
  doc.fontSize(7).fillColor('#9ca3af').text(`Generated by TraceCash on ${new Date().toLocaleDateString()}`, 50, 780, { align: 'center' });

  doc.end();
});

export default router;
