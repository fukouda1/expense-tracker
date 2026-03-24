# MyMoney - Expense Tracker

## Tech Stack
- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- **Charts**: Recharts 3
- **Mobile/APK**: Capacitor 8 + SQLite (raw SQL, no ORM)
- **Backend**: Node.js + Express 5 + TypeScript
- **ORM**: Prisma 6 (MariaDB adapter)
- **Database**: MySQL/MariaDB via XAMPP (port 3306, database: `mymoney`)
- **CI/CD**: GitHub Actions for APK builds

## Project Structure
```
expense_tracker/
├── client/          # React + Capacitor frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── contexts/    # React contexts (Theme, Data)
│   │   ├── local/       # SQLite database + repository (APK mode)
│   │   ├── pages/       # Page components
│   │   ├── services/    # API client
│   │   ├── types/       # TypeScript types
│   │   └── utils/       # Formatters, helpers
│   └── android/         # Capacitor Android project
├── server/          # Express API backend
│   └── src/
│       ├── routes/      # API endpoints
│       ├── services/    # Business logic (CSV importer)
│       ├── utils/       # Database connection
│       └── prisma/      # Schema + migrations
└── .github/workflows/   # APK build automation
```

## Dual-Mode Architecture
- **Web**: Uses Express API + MariaDB via Prisma
- **APK**: Uses local SQLite via Capacitor SQLite plugin (raw SQL)
- Platform detected via `Capacitor.isNativePlatform()`

## Development
```bash
# Server
cd server && npm install && npm run db:generate && npm run db:push && npm run dev

# Client
cd client && npm install && npm run dev

# Import CSV backup
cd server && npm run db:seed -- "path/to/export.csv"
```

## Database
- Tables: transactions, categories, accounts, tags, transaction_tags, budgets, recurring_transactions
- All SQLite queries use raw SQL (no Room/ORM) in client/src/local/
- Server uses Prisma with MariaDB for web mode

## Key Features
- Expense/Income/Transfer tracking with multiple accounts
- Category breakdown (pie charts), monthly trends (line charts)
- Calendar view with daily spending totals
- Budget system with threshold alerts (80%, 100%)
- Recurring transactions (auto-generated on app open)
- Search with dynamic SQL WHERE filters
- CSV import/export (compatible with MyMoney app format)
- Dark mode, Material 3 design
