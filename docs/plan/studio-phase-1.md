# Midscene Studio Phase 1

## Goal

Create a new `apps/studio` shell application powered by `Rsbuild` and
Electron.

## Scope

- Add a new Nx-detected app package under `apps/`
- Use one `rsbuild.config.ts` with three environments:
  - `renderer`: React + Less shell UI
  - `main`: Electron main process bundle
  - `preload`: typed IPC bridge for the renderer
- Ship a light-themed native-feeling two-pane layout
- Vendor shell assets inside `apps/studio` so the app does not depend on
  remote design-export URLs at runtime
- Keep the runtime layering explicit so phase 2 can plug in real device and
  agent flows without reorganizing the app

## Architecture Decisions

- `src/main`: owns native window lifecycle and OS-specific Electron
  integration; static assets are synced from `apps/studio/assets`
  into `dist/assets` by `scripts/sync-static-assets.mjs`
- `src/preload`: the only trusted renderer bridge; business logic stays out
- `src/renderer`: UI only, no direct Node or Electron imports
- `src/shared`: cross-process contracts and types

## Validation

- `pnpm --filter studio build`
- `pnpm run lint`
