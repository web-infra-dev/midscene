# RDP Device Scaffold Plan

## Goal

Add a minimal new package `@midscene/rdp` that proves Midscene can host a protocol-level RDP runtime as a first-class device.

## Chosen approach

Create a standalone package with a fake backend boundary rather than changing `@midscene/computer`.

### Why this approach

- matches the existing `AbstractInterface` abstraction
- keeps local desktop automation and remote protocol automation separate
- gives a clean seam for a future native helper based on FreeRDP or another embedded RDP engine

## Files to add

- `docs/research/rdp-device-scaffold.md`
- `docs/plan/rdp-device-scaffold.md`
- `packages/rdp/package.json`
- `packages/rdp/README.md`
- `packages/rdp/tsconfig.json`
- `packages/rdp/rslib.config.ts`
- `packages/rdp/vitest.config.ts`
- `packages/rdp/src/protocol.ts`
- `packages/rdp/src/backend-client.ts`
- `packages/rdp/src/device.ts`
- `packages/rdp/src/agent.ts`
- `packages/rdp/src/index.ts`
- `packages/rdp/tests/unit-test/agent.test.ts`

## Implementation outline

### 1. Protocol boundary

Define:

- connection config
- connection info
- frame/input backend interface
- request/response placeholder types for a future helper protocol

### 2. Device implementation

`RDPDevice` will:

- hold connection config and backend
- expose `interfaceType = 'rdp'`
- connect through the backend
- expose screenshot and size from the backend
- translate Midscene actions into backend pointer/keyboard/wheel calls

### 3. Agent helper

`agentFromRdp()` will mirror the existing package helpers:

```ts
const device = new RDPDevice(opts);
await device.connect();
return new RDPAgent(device, opts);
```

### 4. Placeholder backend

The default backend will throw a clear error like:

`RDP backend transport is not implemented yet`

That keeps the scaffold truthful while still allowing tests to inject a fake backend.

### 5. Unit tests

Tests will verify:

- `agentFromRdp()` connects and returns an agent
- `RDPDevice` exposes expected actions
- at least one action translates coordinates into backend calls

## Risks and omissions

- This does not provide a working RDP session yet
- Clipboard sync, certificate pinning, gateway, reconnect, and streaming are intentionally out of scope
- The final transport likely needs a helper process or native addon; that decision is deferred until the next implementation step
