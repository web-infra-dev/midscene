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

## Status: Phase 0 complete, Phase 1 in progress (phone-first)

Implemented and **verified on a real Android 12 device** (Termux Node v24.18.0
→ rish → shell uid 2000): transport contract, error codes, capability probing,
`rish` backend (screenshot / input / app management / display info), local device
with transport-backed input primitives (13 actions), plus 116 offline unit tests.

Three device-only findings are baked into the transport:

1. rish cannot carry large payloads — a 674KB PNG came back split across the
   stdout *and* stderr pipes, so screenshots go through an on-device file that
   is read directly and deleted immediately (see `fileChannelDir`).
2. Small command output may land on stderr (`id -u` did), so text commands
   prefer stdout and fall back to stderr.
3. A terminal runtime's `LD_LIBRARY_PATH` breaks `app_process` linking, so
   `LD_LIBRARY_PATH`/`LD_PRELOAD` are stripped by default.

Phase 1 additions: `AdbShellTransport` (host/USB backend, binary-safe
`exec-out` screenshots, no temp files), a shared transport **contract suite**
that every backend must pass, `Launch`/`Terminate` app actions with
`appNameMapping`, and a measured [`docs/baseline.md`](./docs/baseline.md).

Not implemented yet: Shizuku UserService + AIDL, embedded Node runtime, Kotlin
host app, UI tree extraction, multi-touch (pinch), **non-ASCII text input**
(the main gap for Chinese phone usage), YAML regression parity against the ADB
path. See `docs/roadmap.md`.

## Usage

```ts
import {
  AdbShellTransport,
  LocalAndroidDevice,
  RishTransport,
} from '@midscene/android-local';
import { Agent } from '@midscene/core/agent';

// Debug/regression backend: PC + phone over USB (no Shizuku needed).
const usbTransport = new AdbShellTransport({ serial: 'emulator-5554' });

const transport = new RishTransport({
  // Defaults to $MIDSCENE_RISH_PATH, then /data/local/tmp/rish
  rishPath: process.env.MIDSCENE_RISH_PATH,
});

const health = await transport.healthCheck();
if (!health.ok || health.uid !== 2000) {
  throw new Error(`rish is not running with shell privileges: ${health.details}`);
}

const device = await LocalAndroidDevice.create(transport, { displayId: 0 });

const buffer = await transport.screenshot(); // PNG bytes via the on-device file channel
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

## On-device deployment notes (measured)

- Node: Termux `nodejs-lts` (v24.18.0) works; `process.platform === 'android'`.
- **Images need sharp's WebAssembly build**: native sharp has no android-arm64
  binary, so install with `npm install --cpu=wasm32 sharp` (pulls
  `@img/sharp-wasm32`, ~8.9MB). With it, `@midscene/shared`'s image helpers all
  pass on-device — no code changes required. `@silvia-odwyer/photon` is not an
  option on Node (no `main`/`exports`; the loader is browser/worker-only).
- rish needs a one-time Shizuku permission approval for the calling app.
- Keep rish spawns low: each call starts a fresh `app_process` (1.6–1.8s on a
  2-core emulator; screenshot P50 ~2.2s).

## Display notes

`displayId` is a first-class parameter everywhere. A single `dumpsys display`
call routinely reports virtual displays too (for example the `scrcpy` display an
ADB session creates), so never assume `0` is the only screen. `DisplayInfo`
carries `isDefault` and `isVirtual` for exactly that reason.
