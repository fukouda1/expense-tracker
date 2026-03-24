import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const adapter = new PrismaMariaDb({
  host: 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tracecash',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

export default prisma;
