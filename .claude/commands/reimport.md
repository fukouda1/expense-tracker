---
description: Clear MariaDB and re-import the most recent tracecash_backup_*.xlsx from Downloads
---

1. Find the newest `tracecash_backup_*.xlsx` in `C:\Users\JAM\Downloads\` using `ls -t` (or equivalent).
2. Truncate all MariaDB tables (same command as `/reset-db`).
3. Ensure the dev server is running on port 3001 (start it via `mcp__Claude_Preview__preview_start` with name `server` if not).
4. POST the file to the import endpoint:
   ```bash
   curl -s -X POST -F "file=@<path>" http://localhost:3001/api/import/csv
   ```
5. Report the counts (accounts, categories, tags, budgets, recurring, transactions, errors) to the user.

If no backup file exists in Downloads, ask the user to drop one in.
