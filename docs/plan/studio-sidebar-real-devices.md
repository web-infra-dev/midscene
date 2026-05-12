# Studio Sidebar Real Devices Plan

## Goal

Remove mocked sidebar device rows in `apps/studio` and derive platform/device data from the active playground runtime state.

## Scope

- Keep the existing sidebar layout, section order, and icons.
- Replace static device rows with data from `sessionSetup`, `runtimeInfo`, and current form state.
- Preserve Android placeholder rows for booting/error/no-device states, but do not count them as real devices.
- Leave non-Android sections empty until Studio integrates those runtimes for real.

## Implementation

1. Extend renderer playground selectors to derive sidebar device buckets from runtime/session data.
2. Update `Sidebar` to render fixed platform sections with real device buckets instead of embedded mock arrays.
3. Add selector tests that prove:
   - Android connected devices come from runtime/session state.
   - Non-Android buckets stay empty unless there is an actual connected runtime.
   - No fake HarmonyOS/iOS/Computer/Web rows are emitted.

## Files

- `apps/studio/src/renderer/playground/selectors.ts`
- `apps/studio/src/renderer/playground/types.ts`
- `apps/studio/src/renderer/components/Sidebar/index.tsx`
- `apps/studio/tests/playground-selectors.test.ts`

## Validation

- `pnpm --dir apps/studio test`
- `pnpm --dir apps/studio build`
