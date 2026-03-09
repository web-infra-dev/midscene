---
title: Project Setup
impact: CRITICAL
tags: setup, init, convert, project, scaffold
---

# Project Setup

Two workflows: create a brand-new project, or add Midscene + Vitest to an existing one.

---

## Create a New Project

1. **Confirm requirements** with the user:
   - Platform(s): Web / Android / iOS / multiple
   - Feature name for the first test
   - Target URL or app

2. **Scaffold project structure**:
   ```
   <project>/
   ├── e2e/
   │   └── <platform>/         # web/, android/, ios/
   ├── src/
   │   ├── context/            # Platform context classes
   │   │   ├── index.ts
   │   │   ├── base.ts
   │   │   ├── web.ts          # if Web
   │   │   ├── android.ts      # if Android
   │   │   └── ios.ts          # if iOS
   │   ├── report-helper.ts
   │   ├── reporter.ts
   │   └── utils.ts
   ├── vitest.config.ts
   ├── tsconfig.json
   ├── package.json
   ├── .env.example
   └── .env
   ```

3. **Install dependencies**:
   ```bash
   # Core (always needed)
   npm install vitest typescript dotenv --save-dev
   npm install @midscene/core

   # Per platform
   npm install @midscene/web playwright          # Web
   npm install @midscene/android                  # Android
   npm install @midscene/ios                      # iOS
   ```

4. **Copy `src/context/` from the template project**. This includes:
   - `base.ts` — `BaseTestContext`, `TestFixture` type
   - `web.ts` / `android.ts` / `ios.ts` — platform context classes (`WebTest`, `AndroidTest`, `IOSTest`)
   - `index.ts` — barrel exports
   - `report-helper.ts` — report collection and merging
   - `reporter.ts` — custom Vitest reporter
   - `utils.ts` — utilities

5. **Create `vitest.config.ts`**:
   ```typescript
   import 'dotenv/config';
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       include: ['e2e/**/*.test.ts'],
       testTimeout: 180_000,
       hookTimeout: 60_000,
       reporters: ['./src/reporter.ts'],
     },
   });
   ```

6. **Create `.env.example`** with AI model configuration:
   ```env
   MIDSCENE_MODEL_BASE_URL=""
   MIDSCENE_MODEL_API_KEY=""
   MIDSCENE_MODEL_NAME=""
   MIDSCENE_MODEL_FAMILY=""
   ```

7. **Create the first test file** using the matching platform template:
   - Web: [templates/web.md](./templates/web.md)
   - Android: [templates/android.md](./templates/android.md)
   - iOS: [templates/ios.md](./templates/ios.md)

8. **Configure `.env`** and run:
   ```bash
   cp .env.example .env
   # Fill in API keys
   npx vitest run
   ```

---

## Convert an Existing Project

1. **Assess current state**:
   - Does the project already use Vitest? If yes, reuse the existing config.
   - Does it have E2E tests? If yes, identify the framework (Playwright, Cypress, etc.) for migration reference.
   - Check `package.json` for existing dependencies.

2. **Install missing dependencies** (same as step 3 above — skip what's already installed).

3. **Merge `vitest.config.ts`**:
   - If no Vitest config exists, create one (see step 5 above).
   - If one exists, add `e2e/**/*.test.ts` to `include`, set timeouts, and add the custom reporter.

4. **Add `src/context/` module** — copy from the template project (same as step 4 above). Only include platform files for the needed platforms.

5. **Create or migrate test files**:
   - For new tests: use the platform scaffolding templates.
   - For existing E2E tests: convert to the `fixture = XxxTest.init()` + `fixture.create()` pattern, replace selector-based interactions with Midscene AI methods.

6. **Configure `.env`** and verify:
   ```bash
   npx vitest run e2e/<platform>/<first-test>.test.ts
   ```
