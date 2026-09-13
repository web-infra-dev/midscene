# @midscene/android-local

> **范围变更（2026-09-13，已执行）**：端侧现场收敛为 **APK + Shizuku UserService** 一种，Termux + rish 现场已移除，
> `RishTransport` 已更名为 `ShellTransport`。本文件下方仍以 rish 描述历史或部署记录的段落属**有意保留的证据**，
> 决策与执行记录见 [`docs/productization-decisions.md`](./docs/productization-decisions.md) §9。

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

Text input: printable ASCII goes through `input text`; **non-ASCII (Chinese,
emoji) goes through yadb** when the helper is present, and the capability probe
reports `textInput: 'full'`. Provision it once:

```bash
adb push packages/android/bin/yadb /data/local/tmp/yadb   # from the midscene repo
```

Not implemented yet: Shizuku UserService + AIDL, embedded Node runtime, Kotlin
host app, UI tree extraction, multi-touch (pinch), YAML regression parity
against the ADB path, and portrait/rotation validation on a real phone.
See `docs/roadmap.md`.

## CLI (deployment shell)

```bash
midscene-local doctor --backend adb-shell --serial <id>   # capabilities, health, displays, timing
midscene-local run examples/local-agent.config.yaml
```

A config drives a run end to end (device backend, model, tasks, result file);
tasks can be prompts or standard Midscene YAML scripts. See
[`docs/deployment.md`](./docs/deployment.md) for the deployment models — the same
entry point is what an embedded-Node Android app will call in Phase 2.

## Usage

```ts
import {
  AdbShellTransport,
  LocalAndroidDevice,
  ShellTransport,
} from '@midscene/android-local';
import { Agent } from '@midscene/core/agent';

// Debug/regression backend: PC + phone over USB (no Shizuku needed).
const usbTransport = new AdbShellTransport({ serial: 'emulator-5554' });

// On-device backend: the app injects a bridge runner and file I/O, so the
// transport never spawns anything itself. `runner` and `fileChannelDir` are
// required: reaching a shell uid is the runner's job.
const transport = new ShellTransport({
  runner: new ExecBridgeCommandRunner({ url, token }),
  fileIo: createBridgeFileIo(runner),
  fileChannelDir: externalFilesDir,
});

const health = await transport.healthCheck();
if (!health.ok || health.uid !== 2000) {
  throw new Error(`not running with shell privileges: ${health.details}`);
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
