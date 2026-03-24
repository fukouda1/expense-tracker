import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config();

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'src', 'prisma', 'schema.prisma'),
  migrate: {
    connectionString: process.env.DATABASE_URL!,
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
