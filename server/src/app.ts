import express from 'express';
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

export default app;
