# Electron Playground Phase 1

## Goal

Create a new `apps/electron-playground` shell application powered by `Rsbuild`
and Electron.

## Scope

- Add a new Nx-detected app package under `apps/`
- Use one `rsbuild.config.ts` with three environments:
  - `renderer`: React + Less shell UI
  - `main`: Electron main process bundle
  - `preload`: typed IPC bridge for the renderer
- Ship a native-feeling two-pane layout with theme switching
- Keep the runtime layering explicit so phase 2 can plug in real device and
  agent flows without reorganizing the app

## Architecture Decisions

- `src/main`: owns native window lifecycle, persisted shell preferences, and
  OS-specific Electron integration
- `src/preload`: the only trusted renderer bridge; business logic stays out
- `src/renderer`: UI only, no direct Node or Electron imports
- `src/shared`: cross-process contracts and types

## Validation

- `pnpm --filter electron-playground build`
- `pnpm run lint`
