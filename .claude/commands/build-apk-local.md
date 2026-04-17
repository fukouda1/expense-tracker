---
description: Build the client production bundle and sync the Capacitor Android project
---

1. Build the client:
   ```bash
   cd client && npm run build
   ```
2. Sync to Android:
   ```bash
   cd client && npx cap sync android
   ```

Report the final `dist/` size and the list of Capacitor plugins detected by sync.

Note: this does NOT build the APK itself — for the full APK, push to `main` and GitHub Actions (`.github/workflows/build-apk.yml`) will build it.
