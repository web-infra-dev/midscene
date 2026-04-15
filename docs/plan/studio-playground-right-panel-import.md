# Studio Playground Right Panel Import

## Goal

Import the component bundle from `cmnwvgv04001u4zj04xd7venv.zip`, keep the imported structure as a self-contained component bundle inside `apps/studio`, and reuse its right-panel shell styling for the live Studio playground conversation panel.

## Imported Source Structure

- `src/area-main/index.tsx`
- `src/area-main/components/Header/index.tsx`
- `src/area-main/components/Playground/index.tsx`
- `src/area-main/components/ExecutionFlow/index.tsx`
- `src/area-sidebar/index.tsx`
- `src/area-sidebar/components/NavItem/index.tsx`
- `src/area-sidebar/components/BottomActions/index.tsx`
- `src/area-sidebar/Demo.tsx`
- `src/index.css`

## Key Style Handling

- The zip bundle uses Tailwind utility classes directly.
- `src/index.css` only imports Tailwind, so no extra host stylesheet is required beyond Studio's existing Tailwind setup in `apps/studio/src/renderer/App.css`.
- Live Studio integration needs an additional scoped skin file because the real panel body is rendered by `@midscene/playground-app` and `@midscene/visualizer`, not by the static imported mock.

## Implementation Plan

1. Mirror the imported component structure under `apps/studio/src/renderer/components/IncutPlaygroundImport`.
2. Vendor the referenced design assets into `IncutPlaygroundImport/assets/` and centralize their lookup in `assets.ts`.
3. Add `IncutPlaygroundShell` plus a scoped CSS skin to apply the imported right-panel shell style to the live `PlaygroundConversationPanel`.
4. Keep the imported static main/side demo components available for future iteration and visual parity checks.
5. Add a focused Studio test that verifies the imported bundle and the reusable shell render correctly.

## Validation

- `npx nx test studio`
- `pnpm run lint`
- `npx nx build studio`
