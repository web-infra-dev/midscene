# RDP Protocol Helper Research

## Task

Turn `@midscene/rdp` from a scaffold into a real protocol-level runtime that
controls a remote Windows desktop through RDP directly, without routing input
or screenshots through a local `sdl-freerdp` window or `ComputerDevice`.

## Current package state

### Existing RDP surface

- `packages/rdp/src/device.ts`
  - `RDPDevice` already implements `AbstractInterface`
  - maps Midscene actions (`Tap`, `Input`, `KeyboardPress`, `Scroll`,
    `DragAndDrop`) to an injected `RDPBackendClient`
- `packages/rdp/src/agent.ts`
  - `agentFromRdp()` already creates and connects an `RDPDevice`
- `packages/rdp/src/protocol.ts`
  - already defines the TS-side connection config, action enums, and
    `RDPBackendClient` contract
- `packages/rdp/src/backend-client.ts`
  - currently only exports `UnsupportedRDPBackendClient`
  - this is the missing implementation seam

### What is missing

- no real RDP transport
- no helper process
- no child-process protocol between TS and native code
- no real-session AI test that uses protocol-direct control

## Why the local-window path is invalid

The current `packages/rdp/tests/ai/real-session-window.test.ts` uses:

- `sdl-freerdp` to open a visible RDP client window
- `ComputerAgent` / `ComputerDevice` to control the local desktop

This violates the intended package boundary:

- it controls the host OS, not the RDP protocol
- it depends on focus and z-order
- it can act on local apps if the RDP window is not frontmost
- its report cannot prove remote control correctness

That test is useful only as a temporary experiment. It is not a valid
verification path for the protocol backend and should not be treated as the
target architecture.

## Existing Midscene data flow

The protocol-direct path fits the current core abstractions cleanly:

1. `Agent` plans with screenshots and device actions
2. `RDPDevice` provides:
   - `screenshotBase64()`
   - `size()`
   - `actionSpace()`
3. `RDPDevice` translates Midscene actions into backend method calls
4. `RDPBackendClient` becomes the transport boundary to a real helper process

That means the TS-side public surface does not need a redesign. The missing
work is below the existing `RDPBackendClient` interface.

## Reusable patterns already in the repo

### Logging and errors

- Use `getDebug()` from `@midscene/shared/logger`
- Existing `@midscene/rdp` files already follow this pattern
- Repo rule is to throw on failure, not silently return empty values

### Native binary packaging

- `packages/computer/package.json`
  - uses a package-local `build:native` script
  - commits platform-specific binary output under `bin/darwin`
- `packages/computer/native/phased-scroll.m`
  - documents a small native helper that is built locally and shipped with the
    package
- `packages/android/scripts/download-scrcpy-server.mjs`
  - shows a package-local asset/bootstrap pattern for runtime helpers

These patterns suggest `@midscene/rdp` should keep helper lifecycle inside the
package rather than introducing a monorepo-global native build system.

### Child-process JSON line protocol

- `packages/web-integration/src/mcp-tools-cdp.ts`
  - uses `spawn(...)`
  - waits for JSON objects from stdout
  - treats non-JSON stdout as ignorable noise during startup

This is a good reference for a line-delimited JSON control channel between
Node.js and a persistent RDP helper.

### Device action reuse

- `packages/core/src/device/index.ts`
  - already provides the action helper factories used by `RDPDevice`
- `packages/rdp/src/device.ts`
  - already contains correct Midscene-to-backend action mapping

The implementation work should stay focused on the backend and helper transport,
not on redesigning action semantics.

## Real helper feasibility

### Local environment check

The current machine already has FreeRDP development headers and libraries:

- `pkg-config --modversion freerdp3 freerdp-client3` -> `3.24.2`
- `pkg-config --cflags freerdp3 freerdp-client3`
- `pkg-config --libs freerdp3 freerdp-client3`

That makes a package-local helper compiled with `clang` feasible on this macOS
environment without first introducing a dependency download step.

### Relevant FreeRDP capabilities confirmed from headers

- session lifecycle
  - `freerdp_new`
  - `freerdp_connect`
  - `freerdp_disconnect`
- event loop integration
  - `freerdp_get_event_handles`
  - `freerdp_check_event_handles`
- framebuffer access
  - `rdpContext->gdi`
  - `gdi_init` / `gdi_init_ex`
  - `gdi_resize`
  - `rdpGdi->primary_buffer`
  - `rdpGdi->width`
  - `rdpGdi->height`
  - `rdpGdi->stride`
- update hooks
  - `BeginPaint`
  - `EndPaint`
  - `DesktopResize`
  - `SurfaceBits`
- input injection
  - `freerdp_input_send_mouse_event`
  - `freerdp_input_send_extended_mouse_event`
  - `freerdp_input_send_keyboard_event_ex`
  - `freerdp_input_send_unicode_keyboard_event`

This is enough for an MVP helper that:

- connects to the remote session
- maintains a live framebuffer
- reports the remote desktop size
- injects mouse and keyboard input
- returns screenshots to Node.js on demand

## Proposed backend architecture

### Boundary

Keep `RDPDevice` as-is and replace the placeholder backend with a real
`HelperProcessRDPBackendClient`.

### Node.js side

Add a backend client that:

- spawns a helper child process from `packages/rdp/bin/darwin/rdp-helper`
- communicates over stdio using newline-delimited JSON
- assigns request ids and matches async responses
- converts helper failures into thrown JS errors
- owns helper lifecycle in `connect()` / `disconnect()`

### Native side

Add a small long-lived helper process, likely under:

- `packages/rdp/native/rdp-helper.c`

Responsibilities:

- parse JSON commands from stdin
- create and hold one FreeRDP session
- run an event loop thread so the session stays alive
- update the framebuffer as RDP paint events arrive
- encode screenshots for the Node client
- send JSON replies on stdout
- log operational details on stderr only

### Transport protocol shape

The existing `RDPProtocolRequest` / `RDPProtocolResponse` types are a good
starting point but are not yet sufficient for an async helper protocol because
they lack request correlation.

The helper transport needs envelope fields similar to:

- request:
  - `id`
  - `payload`
- response:
  - `id`
  - `ok`
  - `result` or `error`

That change belongs in `packages/rdp/src/protocol.ts`, not in ad-hoc helper-only
types, because the current file is already the package transport boundary.

## Screenshot encoding decision

Two viable options exist:

### Option A: helper returns encoded PNG base64

Pros:

- simplest TS side
- `RDPBackendClient.screenshotBase64()` already wants a base64 data URI
- no extra raw-image marshaling protocol

Cons:

- image encoding must happen in the native helper

### Option B: helper returns raw BGRA frame data and TS encodes it

Pros:

- helper stays closer to framebuffer primitives

Cons:

- current TS utilities do not already provide a clear "raw BGRA buffer to PNG
  data URI" helper
- larger IPC payload and more protocol complexity

For the MVP, helper-side encoding is the lower-risk path.

## Key mapping constraint

`RDPDevice.keyPress()` accepts Midscene key names like:

- `Enter`
- `Backspace`
- `Control+A`
- `Shift+Enter`

The native helper therefore needs a deterministic translation layer from
Midscene key strings to RDP scancodes / unicode events. This is a new piece of
logic; there is no existing RDP-specific mapper in the repo.

This is a real constraint for input correctness:

- text entry can use unicode events first
- shortcuts and modifiers need key press / key release pairs

The MVP should explicitly scope supported key combinations instead of pretending
full layout coverage exists on day one.

## Build and packaging implications

The current `packages/rdp/package.json` only builds TypeScript.

To ship a real helper, `@midscene/rdp` needs package-local native build wiring,
most likely:

- `build:native`
  - compile `native/rdp-helper.c`
  - resolve FreeRDP flags through `pkg-config`
- `build`
  - run native build before or alongside `rslib build`
- `files`
  - include `bin`

This should follow the existing `@midscene/computer` pattern, not invent a new
workspace-level native builder.

## Test implications

### Keep

- `packages/rdp/tests/unit-test/agent.test.ts`
  - still valuable for TS-side action mapping
- `packages/rdp/tests/ai/login-form.test.ts`
  - still valuable as a fixture-based agent/device/backend integration test

### Replace or retire

- `packages/rdp/tests/ai/real-session-window.test.ts`
  - does not validate protocol-direct control
  - should be removed, skipped permanently, or replaced with a protocol-direct
    real-session test once the helper exists

### New protocol-direct verification needed

After the helper exists, add a real-session integration or AI test gated by env
vars that:

- uses `RDPAgent`, not `ComputerAgent`
- uses the real backend client, not a fixture backend
- connects to the real RDP host through the helper
- generates a report from remote-session screenshots

Only that report is valid evidence that `@midscene/rdp` controls the remote
desktop directly.

## Modules that need synchronized changes

- `packages/rdp/src/protocol.ts`
  - add helper-transport correlation envelope
- `packages/rdp/src/backend-client.ts`
  - replace placeholder backend with helper-backed implementation
- `packages/rdp/src/device.ts`
  - only small adjustments if backend defaults or capability flags change
- `packages/rdp/src/index.ts`
  - export the real backend class / factory if public
- `packages/rdp/package.json`
  - native build + packaged helper binary
- `packages/rdp/README.md`
  - document helper requirements and current platform support
- `packages/rdp/tests/ai/real-session-window.test.ts`
  - remove or replace
- `packages/rdp/tests/**`
  - add backend transport tests and real-session coverage

## Constraints and risks

### Platform scope

The confirmed build environment is macOS with Homebrew FreeRDP available. That
is enough for development and validation, but not yet a general publish story
for Linux or Windows.

### External dependency assumption

The MVP may depend on locally installed FreeRDP headers and libs. That is fine
for proving the architecture in-repo, but it must be called out clearly in the
README and test instructions.

### Threading and session liveness

The helper must keep pumping FreeRDP event handles continuously. A helper that
only connects and then blocks on stdin will stall the session.

### Screenshot freshness

The helper needs either:

- a latest-frame cache guarded by a mutex, or
- a serialized single-threaded event loop and command loop

Without that, screenshots can race against paint updates.

### Error propagation

Any helper startup, connect, certificate, auth, or transport failure must be
returned as structured errors and thrown in JS. Silent fallback to the local
desktop is explicitly wrong for this package.

## Recommended implementation direction

The next implementation step should be:

1. add a real helper process and stdio protocol
2. wire `createDefaultRDPBackendClient()` to spawn that helper
3. validate `connect + size + screenshot + mouse click + key press`
4. replace the window-based test with a protocol-direct real-session test

No redesign of the public `RDPDevice` / `RDPAgent` surface is needed before
starting implementation.
