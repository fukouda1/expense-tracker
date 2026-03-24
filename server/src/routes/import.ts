import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { importFromSheets, parseLegacyCsvAndImport } from '../services/csvImporter.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/import/csv — handles .xlsx (multi-sheet) and .csv (legacy MyMoney)
router.post('/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const filename = req.file.originalname.toLowerCase();

    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      // Parse Excel workbook
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheets = new Map<string, Record<string, unknown>[]>();
      for (const name of wb.SheetNames) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets[name]) as Record<string, unknown>[];
        sheets.set(name, data);
      }
      const result = await importFromSheets(sheets);
      res.json(result);
    } else {
      // CSV: detect multi-sheet markers or legacy format
      const csvContent = req.file.buffer.toString('utf-8');
      if (csvContent.includes('[SHEET:')) {
        // Parse multi-sheet CSV into sheet maps
        const sheets = parseMultiSheetCsv(csvContent);
        const result = await importFromSheets(sheets);
        res.json(result);
      } else {
        const result = await parseLegacyCsvAndImport(csvContent);
        res.json(result);
      }
    }
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

function parseMultiSheetCsv(content: string): Map<string, Record<string, unknown>[]> {
  const sheets = new Map<string, Record<string, unknown>[]>();
  const sections = content.split(/\[SHEET:/).slice(1);

  for (const section of sections) {
    const nameEnd = section.indexOf(']');
    const name = section.slice(0, nameEnd);
    const lines = section.slice(nameEnd + 1).split('\n').filter(l => l.trim());
    if (lines.length < 2) { sheets.set(name, []); continue; }

    // Parse header
    const header = parseCsvFields(lines[0]);
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvFields(lines[i]);
      const row: Record<string, unknown> = {};
      header.forEach((h, idx) => { row[h] = fields[idx] ?? ''; });
      rows.push(row);
    }
    sheets.set(name, rows);
  }
  return sheets;
}

function parseCsvFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current); current = '';
    } else { current += ch; }
  }
  fields.push(current);
  return fields;
}

export default router;
