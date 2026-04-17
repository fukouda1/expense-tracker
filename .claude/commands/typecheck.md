---
description: Run TypeScript type-check on both client and server
---

Run both type-checks in parallel (separate Bash calls in the same message):

```bash
cd client && npx tsc --noEmit -p tsconfig.app.json
```

```bash
cd server && npx tsc --noEmit
```

Report results. Note: `src/routes/pdf.ts` will always show a `@types/pdfkit` warning — that's pre-existing and can be ignored.
