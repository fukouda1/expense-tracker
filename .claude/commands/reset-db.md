---
description: Truncate all tables in the tracecash MariaDB (web mode dev DB)
---

Clear the tracecash MariaDB database for fresh testing. Native SQLite on device is untouched.

Run this bash command:

```bash
mysql -u root tracecash -e "SET FOREIGN_KEY_CHECKS=0; \
  TRUNCATE transaction_tags; TRUNCATE transactions; TRUNCATE budgets; \
  TRUNCATE recurring_transactions; TRUNCATE tags; TRUNCATE categories; \
  TRUNCATE accounts; SET FOREIGN_KEY_CHECKS=1; SELECT 'Cleared' AS status;"
```

Then report the output to the user.
