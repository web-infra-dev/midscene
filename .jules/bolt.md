## 2023-10-27 - [Cache resolved system Chrome path]
**Learning:** `existsSync` checks within `packages/shared/src/mcp/chrome-path.ts` were repeatedly called when resolving the Chrome path.
**Action:** Introduced a module-level variable to cache the result of the first successful resolution to avoid repeated synchronous filesystem hits in the same process.
