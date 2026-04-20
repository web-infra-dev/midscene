# RDP Protocol Helper Plan

## Goal

Implement a real protocol-direct backend for `@midscene/rdp` using a
long-lived native FreeRDP helper process that communicates with Node.js over
stdio, so Midscene controls the remote desktop session directly instead of a
local RDP client window.

## Chosen approach

Use a package-local helper binary plus a JS transport client.

- Native helper:
  - one process per `RDPDevice`
  - owns the FreeRDP session
  - maintains the remote framebuffer
  - injects mouse and keyboard input
- JS side:
  - spawns the helper from `packages/rdp/bin/darwin/rdp-helper`
  - sends newline-delimited JSON requests
  - receives structured responses and throws on errors

## Why this approach

- It satisfies the actual requirement: protocol-direct remote control.
- It fits the existing `RDPDevice` / `RDPBackendClient` abstraction without
  redesigning the public API.
- It isolates FreeRDP state from the Node process and makes crashes easier to
  contain and debug.
- It follows package-local native-helper patterns already used elsewhere in the
  repo.

## Files to modify

- `docs/plan/rdp-protocol-helper.md`
- `packages/rdp/package.json`
- `packages/rdp/README.md`
- `packages/rdp/src/protocol.ts`
- `packages/rdp/src/backend-client.ts`
- `packages/rdp/src/index.ts`
- `packages/rdp/tests/ai/real-session-window.test.ts`

## Files to add

- `packages/rdp/native/rdp-helper.c`
- `packages/rdp/src/helper-binary.ts`
- `packages/rdp/tests/unit-test/backend-client.test.ts`
- `packages/rdp/tests/ai/real-session-protocol.test.ts`

## Implementation plan

### 1. Extend the TS transport contract

Update `packages/rdp/src/protocol.ts` so the transport layer can correlate async
requests and responses from the helper process.

Add request and response envelopes:

```ts
export interface RDPHelperEnvelope<T> {
  id: string;
  payload: T;
}

export type RDPHelperRequest =
  RDPHelperEnvelope<RDPProtocolRequest>;

export type RDPHelperResponse =
  | {
      id: string;
      ok: true;
      payload: RDPProtocolResponse;
    }
  | {
      id: string;
      ok: false;
      error: {
        message: string;
        code?: string;
      };
    };
```

Also tighten the existing request/response types so the helper protocol is the
same boundary used by the backend client, instead of inventing a second
parallel transport type.

### 2. Resolve the helper binary path in one place

Add `packages/rdp/src/helper-binary.ts` to encapsulate helper lookup and
platform errors.

Planned shape:

```ts
import path from 'node:path';

export function getRdpHelperBinaryPath(): string {
  if (process.platform !== 'darwin') {
    throw new Error(
      `@midscene/rdp helper is currently only supported on darwin, got ${process.platform}`,
    );
  }

  return path.resolve(__dirname, '../bin/darwin/rdp-helper');
}
```

This keeps backend-client logic focused on transport instead of path assembly.

### 3. Replace the placeholder backend with a real helper-backed client

Rewrite `packages/rdp/src/backend-client.ts` around a new
`HelperProcessRDPBackendClient`.

Core behavior:

- spawn helper once
- keep `stdin`, `stdout`, `stderr`
- parse line-delimited JSON responses
- assign request ids
- reject pending requests on helper exit
- expose the existing `RDPBackendClient` methods

Planned structure:

```ts
export class HelperProcessRDPBackendClient implements RDPBackendClient {
  private child?: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: RDPProtocolResponse) => void;
      reject: (error: Error) => void;
    }
  >();

  async connect(config: RDPConnectionConfig): Promise<RDPConnectionInfo> {
    await this.ensureHelperStarted();
    const response = await this.send({
      type: 'connect',
      config,
    });

    if (response.type !== 'connected') {
      throw new Error(`Expected connected response, got ${response.type}`);
    }

    return response.info;
  }
}
```

Important details:

- helper startup failures throw immediately
- unknown response ids are ignored with debug logging
- stderr is captured only for diagnostics, never parsed as protocol data
- `createDefaultRDPBackendClient()` returns the helper-backed client

### 4. Build a native helper that owns the real RDP session

Add `packages/rdp/native/rdp-helper.c`.

Helper responsibilities:

- parse NDJSON commands from stdin
- maintain one `freerdp*` instance
- create a custom context that stores:
  - connection state
  - last known width / height
  - latest framebuffer pointer / stride
  - a mutex for framebuffer access
- start an event loop thread after connect
- update the framebuffer through GDI / paint callbacks
- return screenshots as `data:image/png;base64,...`
- send success and error envelopes to stdout

Planned helper context sketch:

```c
typedef struct {
  rdpContext context;
  pthread_t event_thread;
  pthread_mutex_t frame_mutex;
  BOOL running;
  BOOL connected;
  BYTE* frame_buffer;
  UINT32 frame_width;
  UINT32 frame_height;
  UINT32 frame_stride;
} midscene_rdp_context;
```

Planned connect path:

```c
freerdp* instance = freerdp_new();
instance->ContextSize = sizeof(midscene_rdp_context);
instance->ContextNew = midscene_context_new;
instance->ContextFree = midscene_context_free;

freerdp_context_new(instance);
gdi_init(instance, PIXEL_FORMAT_BGRA32);

if (!freerdp_connect(instance)) {
  return send_error(id, "Failed to connect to remote RDP server");
}
```

Planned event loop behavior:

- call `freerdp_get_event_handles`
- block on `WaitForMultipleObjects`
- call `freerdp_check_event_handles`
- stop cleanly on disconnect or fatal error

### 5. Encode screenshots inside the helper

For the MVP, encode PNG in the helper rather than sending raw BGRA to Node.

Implementation direction:

- read `context->gdi->primary_buffer`
- build a PNG from BGRA bytes
- base64-encode it
- return a `screenshot` response with a ready-to-use data URI

If macOS ImageIO is the least-friction encoder in this environment, use it from
the helper. If a pure C PNG path is simpler during implementation, use that
instead. The important constraint is:

- screenshot responses must already satisfy `RDPBackendClient.screenshotBase64()`

The helper will never write binary image data to stdout outside the JSON
envelope.

### 6. Add keyboard and pointer translation in the helper

Mouse commands are straightforward:

- `mouseMove`
- `mouseButton`
- `wheel`

Keyboard handling is split:

- `typeText`
  - use unicode keyboard events for text
- `keyPress`
  - parse combinations like `Control+A`
  - press modifiers down
  - send main key
  - release modifiers

Planned parser contract:

```ts
await backend.keyPress('Control+A');
await backend.keyPress('Shift+Enter');
await backend.keyPress('Backspace');
```

The MVP only needs to support the keys currently exercised by `RDPDevice` and
the existing test suite. Unsupported key names should throw explicit errors.

### 7. Add package-local native build wiring

Update `packages/rdp/package.json`:

- include `bin` in `files`
- add `build:native`
- run native build as part of package build

Planned script shape:

```json
{
  "scripts": {
    "build:native": "mkdir -p bin/darwin && clang -O2 -I... -L... native/rdp-helper.c -o bin/darwin/rdp-helper $(pkg-config --cflags --libs freerdp3 freerdp-client3)",
    "build": "pnpm run build:native && rslib build"
  }
}
```

In the actual implementation the include/lib flags will be resolved inline via
`pkg-config` instead of hardcoding Homebrew paths.

### 8. Keep exports minimal and explicit

Update `packages/rdp/src/index.ts` so callers can consume the real backend when
needed, but do not leak helper-internal types that are only transport plumbing.

Expected public exports:

- `RDPDevice`
- `RDPAgent`
- `agentFromRdp`
- `HelperProcessRDPBackendClient`
- `createDefaultRDPBackendClient`

Do not export helper binary path utilities unless they become necessary for
external callers.

### 9. Replace the invalid real-session test

`packages/rdp/tests/ai/real-session-window.test.ts` should not remain as the
"real" validation path.

Plan:

- remove the local-window control logic
- replace it with `real-session-protocol.test.ts`
- gate it behind env vars similar to:
  - `MIDSCENE_RDP_REAL_TEST`
  - `MIDSCENE_RDP_REAL_HOST`
  - `MIDSCENE_RDP_REAL_PORT`
  - `MIDSCENE_RDP_REAL_USERNAME`
  - `MIDSCENE_RDP_REAL_PASSWORD`
- run `RDPAgent` directly against the helper-backed `RDPDevice`

Planned test shape:

```ts
const device = new RDPDevice({
  host: realRdpEnv.host!,
  port: Number(realRdpEnv.port),
  username: realRdpEnv.username!,
  password: realRdpEnv.password!,
});
await device.connect();

const agent = new RDPAgent(device, {
  generateReport: true,
  reportFileName: 'rdp-real-session-protocol-ai-report',
});
```

This test will assert against remote Windows UI state, not local macOS UI
state.

### 10. Add focused backend transport unit tests

Add `packages/rdp/tests/unit-test/backend-client.test.ts`.

Coverage:

- parses successful helper responses
- rejects structured helper errors
- rejects all pending requests if the helper exits unexpectedly
- throws on malformed protocol output

This test should mock `spawn` rather than needing the native helper binary.

## Validation plan

Once implementation starts, the validation sequence will be:

1. `NX_TUI=false npx nx build @midscene/rdp --skip-nx-cache`
2. `NX_TUI=false npx nx test @midscene/rdp --skip-nx-cache`
3. `NX_TUI=false npx nx test:ai @midscene/rdp --skip-nx-cache`
4. `pnpm run lint`

If the real-session env vars are present, the protocol-direct AI test will be
included in step 3.

## Risks and omissions

### Risk: helper build portability

The first implementation is likely macOS-only because the confirmed local
environment already has Homebrew FreeRDP. The README must say that clearly.

### Risk: keyboard coverage

Shortcut handling is the easiest place to get wrong. The MVP should prefer a
small supported set with explicit errors over pretending to support all key
names.

### Risk: screenshot encoding complexity

If PNG encoding in the helper becomes more expensive than expected, the fallback
is to finish the rest of the transport first and then swap the encoder
implementation. The contract to JS stays the same.

### Risk: session event pumping

A helper that does not continuously process FreeRDP event handles will connect
and then stall. The event thread is mandatory in the first implementation, not
an optimization.

### Omission: clipboard, gateway, reconnect

Not part of the MVP. The first cut only covers:

- direct connect
- screenshot
- size
- mouse
- keyboard
- clean disconnect

### Omission: Linux/Windows helper packaging

Also out of scope for the MVP. The implementation should fail loudly on
unsupported platforms.

## What would make this plan fail

- trying to keep the window-based test as the main real-session proof
- mixing raw-frame transport design with helper-side encoded screenshots in the
  same implementation step
- over-expanding key support before the basic connect/screenshot/click path is
  stable
- treating helper stderr as protocol data

## Why this plan is preferred over the alternatives

- Compared with a Node native addon, this keeps build and crash boundaries much
  simpler.
- Compared with driving `sdl-freerdp`, this is actually protocol-direct and
  produces valid remote-control evidence.
- It preserves the existing TS surface, so the implementation effort stays
  focused below `RDPBackendClient` where the real gap is.
