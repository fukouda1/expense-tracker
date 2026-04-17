# TraceCash — Expense Tracker

## 🚦 Git push policy — always ask first

**Never `git push` without explicit user approval in the current turn.** Every push to `main` triggers the APK build workflow (`.github/workflows/build-apk.yml`), which costs GitHub Actions minutes and the user's time to review. It is not a free action.

- Committing locally is fine — do it when the user says "commit" or a clear milestone is reached.
- After committing, **stop** and ask: *"Ready to push to main (this will trigger the APK build)?"*
- Only push after the user explicitly says yes (or types something like "push", "ship it", "go ahead").
- If the user says "push" or "build" up-front for the whole task, that's standing approval — don't re-ask per commit.
- Never `git push --force` or `git push` to any branch other than the current one without asking.

## ⚠️ Maintaining this file
**This file is auto-loaded into every Claude session.** Keep it accurate or future agents will waste tokens re-learning things.

After you ship any change that:
- adds/changes a database column, schema, or Prisma model,
- introduces a new file that other features will depend on,
- adds a new `localStorage` key or XLSX export sheet,
- creates a new convention or non-obvious pattern (something a new agent wouldn't guess),
- changes dev commands, ports, or infra,

**update the relevant section of this file in the same commit.** Keep it dense — remove stale info rather than appending. If a section grows past ~20 lines, consider splitting into a dedicated doc under `docs/` and linking it here.

When in doubt, ask: *"If a new agent started tomorrow, would they find what they need in CLAUDE.md, or would they burn tokens re-discovering it?"* If the latter, add it.

**When to split**: CLAUDE.md is loaded into context on every session, so every line costs tokens. Current target: keep under ~150 lines of dense content. If it grows past that, move the lowest-referenced section (usually "localStorage keys" or detailed conventions) into `docs/<topic>.md` and leave a one-line pointer here. Agents only pay the token cost for docs they actually read.

## Tech Stack
- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind 4 + Recharts 3
- **Mobile/APK**: Capacitor 8 + `@capacitor-community/sqlite` (raw SQL, no ORM)
- **Backend**: Node.js + Express 5 + TypeScript + Prisma 6 (MariaDB)
- **DB**: MariaDB via XAMPP, `tracecash` database on port 3306 (no password, user `root`)
- **CI**: GitHub Actions (`.github/workflows/build-apk.yml`) builds APK on push to `main`

## Dual-Mode Architecture — **read this first**
Every data-touching feature has **two implementations** — forget one and the feature silently breaks on the other platform.

| Concern | Native/APK (`isNative === true`) | Web |
|---|---|---|
| CRUD / queries | `client/src/local/repository.ts` (raw SQL) | `server/src/routes/*.ts` (Prisma) |
| DB schema | `client/src/local/database.ts` (CREATE TABLE + MIGRATIONS_SQL) | `server/src/prisma/schema.prisma` (then `npx prisma db push`) |
| Import from XLSX | `repository.ts` → `importFromSheets()` | `server/src/services/csvImporter.ts` → `importFromSheets()` |
| Export | `client/src/pages/Settings.tsx` builds XLSX locally from repo | Fetches `/api/export/xlsx` from `server/src/routes/export.ts` |

Platform is detected with `Capacitor.isNativePlatform()`. The **only place that branches** between them is `client/src/contexts/DataContext.tsx`; everything above it is platform-agnostic. When adding a new field/feature, touch **all four cells** in the table above for that row.

### Definition of Done — new column / field / data model
Tick every box before you commit. Forgetting any one of these means the feature silently breaks on one platform.

```
☐ TS type updated in client/src/types/index.ts
☐ Prisma schema updated (server/src/prisma/schema.prisma) + `npx prisma db push` + `npx prisma generate`
☐ SQLite CREATE TABLE updated (client/src/local/database.ts) — for fresh installs
☐ SQLite MIGRATIONS_SQL line added (client/src/local/database.ts) — for existing devices
☐ Native repo insert/update/query functions updated (client/src/local/repository.ts)
☐ Server route POST/PUT/GET updated (server/src/routes/<resource>.ts)
☐ DataContext function signature threads the new field (client/src/contexts/DataContext.tsx)
☐ Export includes the field (server/src/routes/export.ts for server, Settings.tsx XLSX builder for native)
☐ Import reads the field back (server/src/services/csvImporter.ts for server, repository.importFromSheets for native)
☐ Default value on missing import column matches the Prisma/SQLite default (for backward compat with old backups)
☐ Both type-checks clean: `cd client && npx tsc --noEmit -p tsconfig.app.json` and `cd server && npx tsc --noEmit`
☐ CLAUDE.md updated if this introduced a new convention or non-obvious pattern
```

## Critical file map
- `client/src/contexts/DataContext.tsx` — THE routing layer. Every component goes through here; do not import `repo` or `api` directly from components.
- `client/src/types/index.ts` — Shared TS types. Add a new field here first.
- `client/src/local/repository.ts` — Every native query. Uses `normalizeBooleans()` to convert SQLite `0/1` → JS `bool`; update it when adding new boolean columns.
- `client/src/local/database.ts` — SQLite schema + migrations. Put new columns in both `CREATE TABLE` (for fresh installs) **and** `MIGRATIONS_SQL` (for existing devices).
- `server/src/routes/*.ts` — Matching Prisma routes. `asyncHandler` wraps every handler for error propagation.
- `client/src/components/PinLock.tsx` — PIN + biometric unlock (auto-prompts on mount).
- `client/src/components/SortableList.tsx` — Drag-and-drop reorder using `@dnd-kit`. Uses `MouseSensor` + `TouchSensor` (NOT `PointerSensor` — that breaks mobile touch).
- `client/src/components/RecurringPreview.tsx` — Dashboard "upcoming" card. Dismissals stored in `localStorage.tracecash_recurring_dismissed` keyed `${id}-${dueDate}`.

## localStorage keys (client-only state, not in DB)
Prefix: `tracecash_`. Key ones:
- `tracecash_pin_enabled` / `tracecash_pin_hash` / `tracecash_pin_verified` (session) — PIN lock
- `tracecash_biometric_enabled` — biometric toggle
- `tracecash_receipts` — `{ "date|amount|type": base64DataUrl }`
- `tracecash_templates_v2` — quick templates
- `tracecash_dismissed_debts` — settled-debt keys (`owed:Name` / `owe:Name`)
- `tracecash_recurring_dismissed` — `{ "${id}-${dueDate}": timestamp }` (30-day auto-cleanup)
- `tracecash_auto_backup` — `{ enabled, lastBackup }`
- `tracecash_view_mode` / `tracecash_show_total` / `tracecash_carry_over` — DisplayContext
- `tracecash_onboarding_done`

**Export/import**: these are preserved via XLSX sheets (`Templates`, `SettledDebts`, `PinLock`, `Receipts`, `AutoBackup`) written in `Settings.tsx` and read in the import handlers in the same file and `repository.importFromSheets`. If you add a new localStorage-backed setting, add it to both export paths (native + web) and both import paths.

## Non-obvious conventions
- **Debt tracking** uses the `notes` field as the person's name. Format: `{person}` or `{person}\n{userNotes}`. First line = grouping key; anything after `\n` = user annotation shown as a caption. Grouping code: `(t.notes?.split('\n')[0] ?? '').trim() || 'Unknown'`.
- **Protected debt categories** (hard-coded in `server/src/routes/categories.ts` PROTECTED_NAMES): `Lent Money`, `Lent Payment`, `Debt`, `Debt Payment` — cannot be deleted/merged.
- **Recurring transactions** have `auto_create` boolean. `false` = reminder only (shown in RecurringPreview, no auto-generation on app open). Processor query: `WHERE active=1 AND auto_create=1 AND amount>0 AND next_date<=today`.
- **sort_order** on accounts/categories/tags: `0` is the "uninitialized" sentinel. `INIT_SORT_ORDER_SQL` (client) and the GET endpoints (server) seed `sort_order=id` only when **all rows** are 0 — guarded by `MAX(sort_order)=0` so a user who has reordered doesn't get position-0 clobbered.
- **Inactive accounts** are hidden from Dashboard total balance and Accounts page. Repo `WHERE a.active=1`, server `where: { active: true }`.
- **AddTransaction returnTo URL** must `encodeURIComponent` the whole `returnTo` value so embedded `&` doesn't leak into the outer query string.
- **Prisma client location**: `server/src/generated/prisma/` (custom output path). Always run `npx prisma generate` after schema changes. `npx prisma db push --accept-data-loss` to sync in dev.

## DisplayContext vs local period state
`client/src/contexts/DisplayContext.tsx` holds a **global** viewMode (weekly/monthly/quarterly/yearly) used by Dashboard, Analytics, etc. Changing it in one place changes it everywhere. If a feature needs its own isolated period filter (e.g. Accounts modal), write local state + the helpers inline instead of using DisplayContext — see `client/src/pages/Accounts.tsx` for the pattern.

## Development
```bash
# Preview config in .claude/launch.json — names "server" (3001) and "client" (5174)
# Use mcp__Claude_Preview__preview_start with those names

# Server DB setup
cd server && npm install && npx prisma generate && npx prisma db push && npm run dev

# Client
cd client && npm install && npm run dev

# Type-check (both should exit 0; server has a pre-existing @types/pdfkit warning)
cd client && npx tsc --noEmit -p tsconfig.app.json
cd server && npx tsc --noEmit

# Clear MariaDB for import testing
mysql -u root tracecash -e "SET FOREIGN_KEY_CHECKS=0; \
  TRUNCATE transaction_tags; TRUNCATE transactions; TRUNCATE budgets; \
  TRUNCATE recurring_transactions; TRUNCATE tags; TRUNCATE categories; \
  TRUNCATE accounts; SET FOREIGN_KEY_CHECKS=1;"

# Import XLSX via API (web mode)
curl -s -X POST -F "file=@path/to/backup.xlsx" http://localhost:3001/api/import/csv

# Sync Capacitor after adding a plugin
cd client && npx cap sync android

# Minimal fixture data (idempotent — safe to re-run)
cd server && npm run seed:dev
```

## Slash commands (`.claude/commands/`)
Quick one-word shortcuts an agent or user can invoke:
- `/reset-db` — truncates all MariaDB tables
- `/reimport` — clear + re-import the newest `tracecash_backup_*.xlsx` from Downloads
- `/typecheck` — runs both client & server TS checks in parallel
- `/build-apk-local` — `npm run build` + `cap sync android`

## Pre-commit hook
`.githooks/pre-commit` warns (never blocks) on dual-mode drift: e.g. if `schema.prisma` changes without `database.ts`, or repo vs server routes. Install once: `git config core.hooksPath .githooks`.

## Tables
`transactions`, `categories`, `accounts`, `tags`, `transaction_tags`, `budgets`, `recurring_transactions`, `audit_logs`. Every `categories/accounts/tags` row has `active: boolean` and `sort_order: int`. `recurring_transactions` additionally has `auto_create: boolean`.

## Commit convention
When committing, use a heredoc for formatting and end with:
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

## Key features
- Expense/Income/Transfer with multiple accounts, transfers use `to_account_id`.
- Category breakdown, monthly trends, savings gauge, cash-flow forecast.
- Calendar view, search with dynamic WHERE, CSV/XLSX import/export.
- Budgets with 80% / 100% threshold alerts.
- Recurring transactions with auto-create / reminder modes.
- Receipt photos (base64 in localStorage, keyed by date+amount+type).
- PIN lock + optional biometric (fingerprint/face on APK).
- Dark mode, Material 3 design, drag-and-drop reorder, swipeable cards, pull-to-refresh.
