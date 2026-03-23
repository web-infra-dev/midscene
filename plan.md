# All-in-One Playground Refactor Plan

This document tracks the staged refactor plan for evolving the current
platform-specific playground implementations into a reusable all-in-one
playground architecture.

## Goals

- Keep every intermediate step readable, reviewable, and low-risk.
- Preserve existing platform-specific CLI entry points while reducing
  duplication under the hood.
- Extract stable abstractions before building the final all-in-one app.
- Make platform differences explicit through descriptors, capabilities, and
  plugins instead of app-level conditionals.

## Current State Summary

- `@midscene/playground` already provides the shared runtime surface:
  `PlaygroundSDK`, `PlaygroundServer`, action execution routes, screenshot
  routes, MJPEG support, cancellation, and launcher helpers.
- `@midscene/playground-app` plus `@midscene/visualizer` already provide a
  generic API-testing workbench shell.
- The biggest remaining duplication lives in:
  - per-platform CLI setup and launch wiring, especially where web and native
    playground entry points still evolve separately
  - per-platform preview wiring (especially Android scrcpy and desktop window
    control)
  - duplicated SDK/bootstrap logic in platform-specific apps

## Phase 0 — Boundaries And Vocabulary

Define and document the architecture layers before changing behavior:

- `PlatformSetup`: prepares a platform-specific session (device selection,
  WDA config, permission checks, etc.)
- `PlaygroundSession`: the runtime session that owns an agent and launch
  options
- `PreviewCapability`: a stable model for screenshot/MJPEG/scrcpy/custom
  preview modes
- `WorkbenchLayout`: UI composition concerns only

Deliverables:

- this plan
- shared terminology in code comments / type names

## Phase 1 — Platform Descriptor Layer

Introduce a stable platform descriptor abstraction so that platform-specific
CLIs no longer hand-roll their own launch wiring.

Scope:

- add shared types/helpers in `@midscene/playground`
- let platform packages expose or consume a typed descriptor/preparation flow,
  including web/browser playground entry points and Harmony/HDC
- keep existing CLI behavior unchanged

Expected benefits:

- makes platform differences explicit
- creates a future single entry point for the all-in-one app
- avoids large UI churn early

## Phase 2 — Preview Descriptor Layer

Make preview behavior a first-class concept instead of embedding it in
platform-specific apps.

Scope:

- add a shared preview descriptor model
- let prepared platform sessions declare preview strategy and capabilities
- represent Android scrcpy, iOS/Harmony/HDC preview flows, and screenshot
  polling through one common type system

Expected benefits:

- removes hidden preview assumptions from app code
- prepares a shared `PreviewPane` for the future workbench

## Phase 3 — Runtime Metadata APIs

Teach the runtime to describe itself through explicit metadata rather than
forcing the UI to infer behavior.

Scope:

- add runtime metadata endpoints such as `runtime-info`, `preview-info`, or
  `capabilities`
- include interface type, preview mode, and execution UX hints

Expected benefits:

- UI becomes data-driven instead of platform-specific
- future workbench code can avoid hardcoded platform checks

## Phase 4 — Shared Workbench Components

Refactor `@midscene/playground-app` from a fixed page shell into a composable
workbench package.

Scope:

- split out `PlaygroundWorkbench`, `ApiPane`, `PreviewPane`, status gates, and
  runtime-info hooks
- support reversible layouts, including the target layout:
  preview on the left, API testing on the right

Expected benefits:

- platform apps can reuse the same shell
- the future all-in-one app becomes composition instead of duplication

## Phase 5 — Migrate Platform Apps To Plugins

Incrementally move Android and Computer onto the shared workbench while
preserving their special behavior.

Scope:

- Android: turn scrcpy/device UI into a preview plugin
- Web: keep the web playground on the shared workbench path so it does not
  become a parallel special case again
- Computer: move countdown / window-control UX into execution lifecycle hooks
- reuse shared SDK/bootstrap logic instead of reimplementing it per app

Expected benefits:

- platform-specific apps shrink into setup + plugin registration
- major duplication disappears before the all-in-one app exists

## Phase 6 — Session Manager

Introduce a session manager above `PlaygroundServer`.

Scope:

- formalize session lifecycle and routing
- support multiple platform sessions under one host process

Expected benefits:

- enables platform switching and multiple concurrent sessions in one app
- creates the real runtime foundation for the all-in-one experience

## Phase 7 — All-in-One Playground App

Build the final app only after the underlying abstractions are stable.

Scope:

- platform selector
- setup wizard
- session list / switching
- shared workbench using the preview-left / API-right layout

Expected benefits:

- the final app stays thin and maintainable
- platform-specific behavior remains isolated in descriptors and plugins

## Guardrails

- Existing platform CLI commands must continue to work during the refactor.
- New abstractions should land before broad UI consolidation.
- Prefer adding types and adapters before changing product surfaces.
- Keep each PR narrow enough to review without needing the future phases in
  mind.
