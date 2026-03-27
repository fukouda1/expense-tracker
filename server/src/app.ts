import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from './middleware/rateLimit.js';
import transactionsRouter from './routes/transactions.js';
import categoriesRouter from './routes/categories.js';
import accountsRouter from './routes/accounts.js';
import tagsRouter from './routes/tags.js';
import analyticsRouter from './routes/analytics.js';
import budgetsRouter from './routes/budgets.js';
import recurringRouter from './routes/recurring.js';
import importRouter from './routes/import.js';
import exportRouter from './routes/export.js';
import pdfRouter from './routes/pdf.js';

const app = express();

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));

app.use('/api', rateLimit(200, 60000));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api/import', importRouter);
app.use('/api/export', exportRouter);
app.use('/api/export/pdf', pdfRouter);

// Global error handler — must be last middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err?.message ?? err);

  // Prisma: record not found (update/delete on non-existent ID)
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  // Prisma: foreign key constraint
  if (err?.code === 'P2003') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }
  // Prisma: unique constraint
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'A record with this value already exists' });
  }
  // Explicit HTTP errors thrown by route handlers
  if (err?.status) {
    return res.status(err.status).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});

export default app;
