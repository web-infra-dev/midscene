## Background

The repository currently has two separate desktop-control packages:

- `packages/computer`
  - local desktop automation for macOS / Windows / Linux
  - exports `ComputerDevice`, `ComputerAgent`, and `agentFromComputer()`
- `packages/rdp`
  - protocol-level remote Windows automation over RDP
  - exports `RDPDevice`, `RDPAgent`, and `agentFromRdp()`

The new requirement is to treat RDP as part of the `@midscene/computer`
surface instead of as an independent package with its own agent abstraction.

## Relevant Modules

### `packages/computer`

- `src/device.ts`
  - owns the local OS-backed desktop device
  - implements `AbstractInterface`
  - provides the canonical desktop action space for tap, input, scroll,
    keyboard press, drag and drop
- `src/agent.ts`
  - thin `PageAgent<ComputerDevice>` wrapper
  - adds no behavior beyond construction convenience
- `src/index.ts`
  - public export surface
- `package.json`
  - package identity, build targets, native helper build, and test entry

### `packages/rdp`

- `src/device.ts`
  - protocol-backed desktop device with the same Midscene action shape as
    `ComputerDevice`
- `src/backend-client.ts`
  - helper-process transport and helper lifecycle management
- `src/protocol.ts`
  - connection config and helper protocol types
- `src/helper-binary.ts`
  - helper binary resolution
- `src/agent.ts`
  - thin `PageAgent<RDPDevice>` wrapper
  - adds no behavior beyond construction convenience
- `native/**`
  - portable C++ helper and native build configuration
- `tests/**`
  - unit tests around backend/device wiring and AI tests for fixture and real
    RDP sessions

## Reusable Existing Tools

- `@midscene/core/agent.Agent`
  - both `ComputerAgent` and `RDPAgent` are thin aliases over the same generic
    agent implementation
- `@midscene/core/device` action helpers
  - both local and RDP devices already use the same Midscene action model
- `@midscene/shared/logger.getDebug`
  - already used by both packages for scoped logging
- `packages/computer` native build pattern
  - package-local `build:native` output under `bin/<platform>`
- `packages/computer` vitest + rslib setup
  - the existing package already hosts AI and unit tests and is the natural
    long-term home for desktop-control variants

## Data Flow And Responsibility

### Local computer path

`ComputerAgent -> ComputerDevice -> libnut / screenshot-desktop / platform helpers`

### Current RDP path

`RDPAgent -> RDPDevice -> HelperProcessRDPBackendClient -> rdp-helper -> FreeRDP`

The important observation is that `RDPDevice` is not a subtype of the current
local `ComputerDevice` implementation. It is a second desktop device that
shares the same user-facing action semantics but uses a completely different
runtime backend.

## Constraints

- `RDPAgent` should not remain as a separate public concept.
- The default local `@midscene/computer` path must remain unchanged when no RDP
  config is provided.
- The protocol-level RDP helper, protocol types, and tests still need a stable
  home after consolidation.
- RDP remains a remote Windows-only runtime even if the helper process itself
  is launched from macOS, Linux, or Windows.

## Required Sync Scope

- `packages/computer/package.json`
- `packages/computer/src/index.ts`
- `packages/computer/src/agent.ts`
- new RDP-related files under `packages/computer/src/...`
- new native helper files under `packages/computer/native/...`
- `packages/computer/tests/**`
- `packages/computer/vitest.config.ts`
- `packages/computer/README.md`
- root docs that still mention `@midscene/rdp`
- `pnpm-lock.yaml`
- removal of `packages/rdp` package files and exports once consumers are moved

## Consolidation Options

### Option A: move all RDP code into `ComputerDevice`

Reject.

This would force one class to own both:

- local OS input injection
- remote protocol session management

That would couple unrelated runtime concerns and make both code paths harder to
maintain.

### Option B: keep separate device classes under `@midscene/computer`

Preferred.

Use `@midscene/computer` as the single public package, but keep two concrete
device implementations inside it:

- local `ComputerDevice`
- remote `RdpComputerDevice` (or similar)

Then make `agentFromComputer()` choose the correct device implementation from a
discriminated config shape.

This preserves:

- one public package
- one agent construction path
- separate runtime implementations

## Recommended Target Shape

- `packages/computer/src/device.ts`
  - keep local desktop device only
- `packages/computer/src/rdp/**`
  - move protocol types, backend client, helper path resolution, and remote
    device implementation here
- `packages/computer/src/agent.ts`
  - keep a single `ComputerAgent`
  - change `agentFromComputer()` to instantiate either the local device or the
    RDP device based on a discriminated option
- `packages/computer/src/index.ts`
  - export the single public agent API
  - export RDP-specific types and device class as sub-features of
    `@midscene/computer`
- remove `packages/rdp`

## Public API Direction

The most maintainable public API is:

- keep `agentFromComputer()` as the only agent helper
- introduce a discriminated option such as:
  - local: existing `ComputerDeviceOpt`
  - remote RDP: `{ remote: { type: 'rdp', ...connectionConfig } }`

This avoids adding another agent surface while preserving explicit remote
configuration.

## Risks

- Broad file moves can silently break alias-based imports in tests.
- Native helper build wiring must merge cleanly with the existing
  `packages/computer` native build.
- `ComputerAgent` typing must widen carefully so existing local users do not
  lose type safety unnecessarily.
- Docs and validation commands must stop referring to `@midscene/rdp`.

## Implementation Notes

- Do not merge local and RDP logic into one device class.
- Prefer moving RDP files under `packages/computer/src/rdp/` and re-exporting
  them from `@midscene/computer`.
- Keep the remote device `interfaceType` as `rdp` unless a concrete reporting
  or planner issue forces unification. Package consolidation does not require
  device identity erasure.
