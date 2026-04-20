# RDP Device Scaffold Research

## Task

Add a protocol-level `rdpDevice` scaffold that fits Midscene's existing device architecture without routing through the local desktop `ComputerDevice`.

## What exists today

- `Agent` already accepts any `AbstractInterface` implementation and builds its action space from the interface at runtime.
  - `packages/core/src/agent/agent.ts`
- `AbstractInterface` is intentionally small:
  - `screenshotBase64()`
  - `size()`
  - `actionSpace()`
  - optional lifecycle and metadata hooks
  - `packages/core/src/device/index.ts`
- `ComputerDevice` is a local-OS device, not a remote protocol device.
  - It captures the local screen with `screenshot-desktop`
  - It injects local mouse/keyboard events with `libnut` / AppleScript
  - `packages/computer/src/device.ts`

## Architectural implication

The clean design is a new package, not an extension of `@midscene/computer`.

- `@midscene/computer` should remain "control the current host OS desktop"
- `@midscene/rdp` should mean "control a remote desktop session over the RDP protocol"

That separation keeps:

- host-device permissions and behavior out of protocol code
- headless operation possible for RDP later
- reconnection, certificate, gateway, and transport logic isolated from local desktop concerns

## Existing package conventions

- Platform runtimes live under `packages/<name>`
- Package build uses `rslib`
- Package-level `package.json`, `tsconfig.json`, `rslib.config.ts`, and `vitest.config.ts` are the normal pattern
- Workspace package discovery is automatic via `pnpm-workspace.yaml`

## Reusable patterns

- `packages/computer/src/index.ts` and `packages/computer/src/agent.ts`
  - export a package-specific device and `agentFrom...` helper
- `packages/ios/src/device.ts`
  - good example of a device implementation that wraps a backend client instead of talking directly to the OS
- `packages/core/src/device/index.ts`
  - reusable action helper factories for tap, input, keyboard press, scroll, drag-and-drop, etc.

## Proposed scaffold

Create `packages/rdp` with:

- `src/protocol.ts`
  - protocol and backend interfaces
- `src/backend-client.ts`
  - default placeholder backend that throws a clear "not implemented" error
- `src/device.ts`
  - `RDPDevice implements AbstractInterface`
- `src/agent.ts`
  - `RDPAgent` and `agentFromRdp`
- `src/index.ts`
  - package exports
- `tests/unit-test/agent.test.ts`
  - validates the scaffold through a fake backend

## Scope boundary for this change

This scaffold will not implement a real RDP transport yet.

It will do three things only:

1. define the public surface for an RDP device
2. make the package buildable and testable
3. prove that Midscene can host a protocol-level `rdp` interface without going through `ComputerDevice`

## Constraints and risks

- No current helper process or native binding exists in-repo for protocol-level RDP frame/input transport
- The placeholder backend must fail loudly, not silently fall back to local desktop control
- The package should stay honest about being a scaffold so users do not assume RDP transport already works
