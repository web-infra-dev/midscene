# @midscene/rdp

Protocol-level RDP device for Midscene.

This package controls a remote Windows desktop directly through the RDP
protocol. It does not route screenshots or input through a local
`sdl-freerdp` window.

## Current platform support

- Runtime helper: `darwin` only
- Native dependency: local FreeRDP development headers and libraries available
  through `pkg-config`

## Build the native helper

```bash
pnpm --filter @midscene/rdp run build:native
```

The package build runs this automatically:

```bash
pnpm --filter @midscene/rdp run build
```

## Real-session AI test

```bash
MIDSCENE_RDP_REAL_TEST=1 \
MIDSCENE_RDP_REAL_HOST=<host> \
MIDSCENE_RDP_REAL_PORT=3389 \
MIDSCENE_RDP_REAL_USERNAME=<username> \
MIDSCENE_RDP_REAL_PASSWORD=<password> \
MIDSCENE_RDP_REAL_IGNORE_CERTIFICATE=1 \
pnpm --filter @midscene/rdp run test:ai -- tests/ai/real-session-protocol.test.ts
```

This path uses `RDPAgent` and `RDPDevice` directly, so the generated report is
evidence of protocol-level remote control instead of local-window automation.
