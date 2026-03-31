import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Transaction, Category, Budget } from '../types';

interface PdfExportParams {
  month: string; // YYYY-MM
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
}

export async function generateMonthlyPdf({ month, transactions, categories, budgets }: PdfExportParams): Promise<string> {
  const [year, mon] = month.split('-').map(Number);
  const monthName = new Date(year, mon - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const monthTx = transactions.filter(t => t.date.startsWith(month));
  const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const transfer = monthTx.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);

  // Category breakdown
  const catMap = new Map<string, { name: string; total: number; count: number }>();
  for (const t of monthTx.filter(tx => tx.type === 'expense' && tx.category_name)) {
    const key = t.category_name!;
    const entry = catMap.get(key) ?? { name: key, total: 0, count: 0 };
    entry.total += t.amount;
    entry.count++;
    catMap.set(key, entry);
  }
  const catBreakdown = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

  const fmt = (n: number) => `PHP ${n.toLocaleString('en', { minimumFractionDigits: 2 })}`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129); // emerald
  doc.text('TraceCash', pageWidth / 2, 50, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(55, 65, 81);
  doc.text(`Financial Report — ${monthName}`, pageWidth / 2, 72, { align: 'center' });

  // Summary
  let y = 105;
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text('Summary', 50, y);
  doc.setDrawColor(229, 231, 235);
  doc.line(50, y + 4, 545, y + 4);
  y += 22;

  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  const summaryLines = [
    `Total Income:      ${fmt(income)}`,
    `Total Expenses:    ${fmt(expense)}`,
    `Transfers:         ${fmt(transfer)}`,
    `Net Savings:       ${fmt(income - expense)}`,
    `Savings Rate:      ${income > 0 ? ((income - expense) / income * 100).toFixed(1) : '0.0'}%`,
    `Transactions:      ${monthTx.length}`,
  ];
  for (const line of summaryLines) {
    doc.text(line, 50, y);
    y += 15;
  }

  // Category breakdown table
  if (catBreakdown.length > 0) {
    y += 10;
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text('Expense Breakdown by Category', 50, y);
    doc.line(50, y + 4, 545, y + 4);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['Category', 'Amount', 'Count', '%']],
      body: catBreakdown.map(c => [
        c.name,
        fmt(c.total),
        String(c.count),
        expense > 0 ? `${(c.total / expense * 100).toFixed(1)}%` : '0%',
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 50, right: 50 },
    });

    y = (doc as any).lastAutoTable.finalY + 15;
  }

  // Budget vs Actual
  const monthBudgets = budgets.filter(b => b.month === month);
  if (monthBudgets.length > 0) {
    if (y > 650) { doc.addPage(); y = 50; }
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text('Budget vs Actual', 50, y);
    doc.line(50, y + 4, 545, y + 4);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['Category', 'Budget', 'Actual', 'Status']],
      body: monthBudgets.map(b => {
        const catName = categories.find(c => c.id === b.category_id)?.name ?? 'Overall';
        const spent = monthTx.filter(t => t.type === 'expense' && (!b.category_id || t.category_id === b.category_id)).reduce((s, t) => s + t.amount, 0);
        const pct = b.amount > 0 ? Math.round(spent / b.amount * 100) : 0;
        const status = pct >= 100 ? `${pct}% OVER` : pct >= 80 ? `${pct}% WARNING` : `${pct}% OK`;
        return [catName, fmt(b.amount), fmt(spent), status];
      }),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 50, right: 50 },
    });

    y = (doc as any).lastAutoTable.finalY + 15;
  }

  // Transaction list
  if (monthTx.length > 0) {
    doc.addPage();

    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text('Transaction Details', 50, 50);
    doc.line(50, 54, 545, 54);

    autoTable(doc, {
      startY: 62,
      head: [['Date', 'Type', 'Amount', 'Category', 'Account', 'Notes']],
      body: monthTx.sort((a, b) => a.date.localeCompare(b.date)).map(t => [
        t.date.slice(0, 10),
        t.type === 'income' ? 'INC' : t.type === 'expense' ? 'EXP' : 'TRF',
        fmt(t.amount),
        t.category_name ?? '-',
        t.account_name ?? '-',
        (t.notes ?? '').slice(0, 30),
      ]),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 50, right: 50 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const val = data.cell.raw as string;
          if (val === 'INC') data.cell.styles.textColor = [16, 185, 129];
          else if (val === 'EXP') data.cell.styles.textColor = [239, 68, 68];
          else data.cell.styles.textColor = [59, 130, 246];
        }
      },
    });
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(`Generated by TraceCash on ${new Date().toLocaleDateString()} — Page ${i}/${pageCount}`, pageWidth / 2, 820, { align: 'center' });
  }

  // Return as base64
  return doc.output('datauristring').split(',')[1];
}
