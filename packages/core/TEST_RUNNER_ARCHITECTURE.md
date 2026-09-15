# Test Runner architecture

The Runner executes both legacy `tasks/flow` documents and native
`cases/steps` documents. Native Nodes expose the Agent and device action
capabilities directly, and native Project setup can use the same platform
configuration as the legacy host.

## Package boundaries

- Core owns the document/Case/Step engine, cancellation and resource ownership,
  Agent-owned Node descriptions, legacy input adaptation, execution records,
  and report projection.
- `@midscene/test` owns native project configuration, discovery and scheduling,
  custom Node registration, and run publication. Its private
  `internal/yaml-runtime` integration entry owns platform initialization and its
  cleanup stack; it is not a native Test SDK API. The runtime implementation has
  no CLI or scheduler dependency. Platform packages are optional peers and loaded
  only for the selected target.
- `@midscene/cli` keeps the existing CLI, Rstest scheduling, batch options, and
  public entry points. It reuses the host through
  `@midscene/test/internal/yaml-runtime` and
  consumes Core execution facts. The host is part of the existing Test package;
  it does not require a separate package or release pipeline.
- The report viewer consumes the same logical document/Case/attempt model from
  either frontend. Report serialization has no legacy compatibility shims.

Core must not import Test, Rstest, or a device launcher. Test must not depend on
CLI. Agent Node discovery is static and must not launch browsers or devices.
The parser-neutral kernel is exported through `internal/test-runner`; YAML
format compilation and nested YAML ownership use the separate
`internal/yaml-runtime` integration surface.

The existing `runTestProject` entry resolves input formats internally. Preparation
owns config resolution, collection and validation; YAML compatibility interprets
old fields and returns a syntax-independent prepared plan. Shared scheduling and
document execution consume resolved retry scopes, concurrency, prerequisite
Documents and lifecycle bindings. They do not import YAML configuration, inspect
format discriminators, or read browser/Agent compatibility fields.

YAML compatibility is concentrated at three boundaries: input conversion,
resource-host bindings, and old result/summary projection. Native Test configuration,
Nodes and formal run results do not expose compatibility controls. The private
CLI integration publishes the old summary without adding compatibility fields to
the Test run return value. Existing old CLI APIs retain their result shape through
their own facade. All invocations feed the same Case, document and execution-record
sinks. The legacy
`ScriptPlayer` remains an API facade, while record construction and report
publication live in dedicated host projections.

## Semantics retained at the boundary

A legacy task maps to one Case and each flow item maps to one Step. The legacy
adapter preserves aliases, raw result values, task `continueOnError`, output
names, shared document report scope, and whole-file retry. Validation that
used to fail when reaching a task still fails at that task, so earlier actions
and continuation remain observable. The native parser and its JSON result
contract remain independent.

Native retry remains per Case, while legacy retry remains per Document.
Native `testTimeout` remains a Step default; legacy execution preserves its old
timeout defaults and action-level wait limits. These policies are resolved before
execution and do not require separate engines or new native Test parameters.

Legacy document parsing retains environment interpolation before YAML parsing.
Format discovery must not reject syntax accepted after interpolation. Native
projects own environment loading; discovery does not load `.env` for native-only
files.

The public Agent assertion API may return a raw `pass: false` response.
An assertion Node interprets that response as a failed assertion, including
when `keepRawResponse` is requested.

## Execution, cleanup and publication

Execution results are facts. Setup, action, cleanup, observer and publication
failures are retained separately. Only action/execution policy may start another
attempt. A failed report write or observer callback must not rerun successful
business actions, and a later successful publication must not erase an earlier
infrastructure failure.

A Step timeout or abort ends the Runner wait; it does not prove that the actual
Agent operation has stopped. Resource tracking follows actual completion.
Cleanup waits before hooks and again before disposal. A bounded grace period
can report deferred cleanup, while the completion remains tracked by the parent
scope. Resources stay unavailable to external callers until cleanup completes;
only the cleanup owner's hooks can use them during that interval.

Borrowed Agents and browser resources remain owned by the setup that created
them. The legacy adapter and native Node adapter must not independently destroy
those resources. Native Nodes register report sources without taking ownership
of a borrowed Agent.

Nested `Agent.runYaml()` contributes to its enclosing execution and report.
Only an actual root invocation publishes a root YAML report. The execution
session boundary is necessary for Agent cache replay and nested YAML execution.

## Reports and retries

A repeated file invocation with increasing `attemptIndex` belongs to one
logical document; its tasks belong to logical Cases with `attempts`. A new
invocation starting at attempt zero remains independent. Each document attempt
retains its own setup/hooks, cleanup, report scope and errors. Case and document
attempt selection must resolve the matching lifecycle and Agent execution
references. Final counts use final outcomes, while retry and first-pass metrics
use attempt history.

Report and output publication belong to the host. Preserve each completed
execution before a fallible artifact operation. Protect conflicting paths and
shared resources through publication and any deferred cleanup; unrelated
invocations should not require a global serialization gate.

Native Test always requests an aggregate report named `midscene-e2e-{runId}`.
Legacy report-disable intent is resolved by compatibility preparation, not by a
native `output.report.enabled` option. A disabled legacy Document cannot disable
the aggregate report of a mixed native run or acquire a report link in the old
summary. Both hosts use the new report projection and renderer.

Publication runs in order: aggregate report, optional host artifacts (including
the old YAML summary), then the final Test summary. Every publication goes through
the same error coordinator. A host artifact failure cannot return success, start
another business attempt, or bypass final Test summary publication.

## Verification contracts

Use focused Core engine/YAML/report projection suites, Test project/legacy/
Node/runtime suites, CLI host/Rstest/summary suites, and report viewer model
suites. Mocked Agent methods and deterministic custom interfaces cover execution
policy without model calls. Cross-package exports require focused builds before
the dependent suites run. Real browser/device and model integration requires
its corresponding environment and is separate from these deterministic tests.
