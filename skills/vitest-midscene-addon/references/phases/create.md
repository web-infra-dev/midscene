---
title: "Phase: Create"
impact: CRITICAL
tags: create, scaffold, new-project
---

# Phase: Create

Create a brand-new Midscene + Vitest E2E testing project from scratch.

**Precondition:** [detect.md](../detect.md) determined the state is **Empty**.
**Postcondition:** The project satisfies all **Ready** conditions in detect.md.

---

## Steps

### 1. Confirm requirements

Ask the user:
- **Platform(s)**: Web / Android / iOS / multiple
- **Package manager**: npm / yarn / pnpm / bun
- **Feature name** for the first test
- **Target URL or app**

### 2. Scaffold project structure

Create the directory structure defined in [specs/project-spec.md](../specs/project-spec.md#directory-structure). Only include platform files for the platforms the user requested.

### 3. Generate configuration files

Create `vitest.config.ts`, `tsconfig.json`, `.env`, and `package.json` according to [specs/project-spec.md — Configuration Files](../specs/project-spec.md#configuration-files).

### 4. Install dependencies

Install all packages listed in [specs/project-spec.md — Dependencies](../specs/project-spec.md#dependencies) using the user's chosen package manager.

### 5. Copy infrastructure code from boilerplate/

Copy `src/` from the `boilerplate/` directory of this skill. This includes context classes, report helper, reporter, and utilities. Also copy `vitest.d.ts` from the boilerplate root to the project root.

See [specs/project-spec.md — Infrastructure Code](../specs/project-spec.md#infrastructure-code) for the full list.

### 6. Create the first test file

Use the matching platform pattern:
- Web: [patterns/web.md](../patterns/web.md)
- Android: [patterns/android.md](../patterns/android.md)
- iOS: [patterns/ios.md](../patterns/ios.md)

### 7. Configure and verify

```bash
# Fill in API keys in .env
npx vitest run
```

### 8. Verify Ready state

Re-check all **Ready** conditions in [detect.md](../detect.md). If any fail, fix before proceeding.
