# @midscene/android-local

Device-local Android automation for Midscene. The agent core stays untouched;
only the device channel changes, so a car head unit or phone can host the agent
instead of a PC running ADB.

```text
Midscene Core / Agent / YAML      (unchanged)
        │
  LocalAndroidDevice              ← "what the device can do"
        │
  AndroidTransport                ← "through which privilege channel"
        │
  RishTransport (POC) · Shizuku UserService · OEM privileged · ADB
```

Design baseline, roadmap and the Phase 0 playbook live in
[`docs/`](./docs/README.md) (start with [`docs/roadmap.md`](./docs/roadmap.md)).

## Status: Phase 0 skeleton

Implemented: transport contract, error codes, capability probing, `rish`
backend (screenshot / input / app management / display info), local device with
transport-backed input primitives, plus purely offline unit tests.

Not implemented yet: Shizuku UserService + AIDL, embedded Node runtime, Kotlin
host app, UI tree extraction, multi-touch (pinch), non-ASCII text input, YAML/AI
regression parity with the ADB path. See `docs/roadmap.md` for the full plan.

## Usage

```ts
import { LocalAndroidDevice, RishTransport } from '@midscene/android-local';
import { Agent } from '@midscene/core/agent';

const transport = new RishTransport({
  // Defaults to $MIDSCENE_RISH_PATH, then /data/local/tmp/rish
  rishPath: process.env.MIDSCENE_RISH_PATH,
});

const health = await transport.healthCheck();
if (!health.ok || health.uid !== 2000) {
  throw new Error(`rish is not running with shell privileges: ${health.details}`);
}

const device = await LocalAndroidDevice.create(transport, { displayId: 0 });

const buffer = await transport.screenshot(); // PNG bytes, no temp file
const agent = new Agent(device, { generateReport: false });
await agent.aiAct('open Settings and turn off Wi-Fi');
```

Diagnostics without a model:

```ts
const capabilities = await transport.getCapabilities();
console.log(await transport.runShell?.('dumpsys display'));
await transport.close();
```

## Hard rules

1. Only `src/transport/**` may know about shell commands, Binder, AIDL or
   privilege details. `LocalAndroidDevice` only calls `AndroidTransport`.
2. Business code never concatenates `adb` / `rish` commands. Structured
   arguments in, structured results (or typed errors) out.
3. `@midscene/core` never depends on Android, Shizuku or JNI.
4. Every transport failure surfaces as an `AndroidTransportError` with a
   machine-readable `code` (`PermissionDenied`, `CommandFailed`,
   `ScreenshotFailed`, `Timeout`, `ServiceUnavailable`, `NotSupported`,
   `InvalidArgument`). Callers switch on the code, never on `stderr` text.
5. Unsupported capabilities fail loudly (`NotSupported`) instead of silently
   half-working — non-ASCII text input is the current example.

## Tests

```bash
npx nx test @midscene/android-local   # fully offline, driven by FakeCommandRunner
npx nx build @midscene/android-local  # dist/lib + dist/es + dist/types
```

Unit tests must not require a device: the transport is exercised through
`FakeCommandRunner`, which records every argv and fails loudly on unexpected
commands so command drift is caught in CI.

## Display notes

`displayId` is a first-class parameter everywhere. A single `dumpsys display`
call routinely reports virtual displays too (for example the `scrcpy` display an
ADB session creates), so never assume `0` is the only screen. `DisplayInfo`
carries `isDefault` and `isVirtual` for exactly that reason.
