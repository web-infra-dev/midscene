/**
 * POC: shared flow intermediate representation (flow-IR).
 *
 * Both authoring front-ends (the JS/TS fluent API in `frontends/js` and the
 * Gherkin compiler in `frontends/gherkin`) compile to this IR. The IR executor
 * (`run-scenario.ts`) then lowers each IR step onto the engine's existing node
 * kinds (ui / verify / soft / agent via `runNode`), adding two capabilities on
 * top of the Phase 0 engine:
 *
 *  - a scenario-scoped VARIABLE TABLE: `capture` steps extract machine-owned
 *    values through the UI agent (`aiString`), and `{varName}` placeholders in
 *    later step templates are substituted mechanically BEFORE the prompt is
 *    sent to any model. Model-owned prose conclusions keep flowing through the
 *    existing `StepOutput` channel — the two channels never mix.
 *  - NAMED FLOWS: parameterized, reusable prompt sequences registered in a
 *    {@link FlowRegistry}-shaped registry. A `callFlow` step runs the callee
 *    with a fresh variable scope (seeded only with the declared args); only
 *    the callee's declared `returns` flow back into the caller scope. UI /
 *    browser state is naturally shared (same UI agent).
 */
import type { BuiltinNodeType } from '../types';

/** Keyword→policy mapping: what authoring role a prompt step plays. */
export type PromptRole = 'setup' | 'action' | 'assertion' | 'advisory';

/**
 * A natural-language prompt step. Lowers 1:1 onto an engine node:
 * given-like → `ui` (setup), when-like → `ui` (action), then-like → `verify`
 * (fail-closed), soft variants → `soft`, advisory → `agent`.
 */
export interface PromptStepIR {
  kind: 'prompt';
  node: BuiltinNodeType;
  role: PromptRole;
  /** Natural-language template; may contain `{varName}` placeholders. */
  template: string;
}

/**
 * Variable capture ("remember ... as varName"). Lowers to a structured
 * extraction via the UI agent (`aiString`), storing the result in the current
 * variable scope under {@link CaptureStepIR.varName}.
 */
export interface CaptureStepIR {
  kind: 'capture';
  /** What to extract, as natural language; may contain `{varName}` placeholders. */
  template: string;
  /** Machine-owned variable name the captured value is stored under. */
  varName: string;
}

/** Invocation of a named flow from the registry. */
export interface CallFlowStepIR {
  kind: 'callFlow';
  flowName: string;
  /**
   * Arguments by declared param name. Values are templates: `{varName}`
   * placeholders are substituted against the CALLER scope before the call.
   */
  args: Record<string, string>;
}

export type FlowIRStep = PromptStepIR | CaptureStepIR | CallFlowStepIR;

/**
 * Per-scenario execution config attached at the IR level (e.g. by a
 * `bindFeature` overlay). The IR executor itself ignores these — they are a
 * contract for the runner layer (which is out of scope for this POC).
 */
export interface ScenarioConfigIR {
  skip?: boolean;
  only?: boolean;
}

/** A runnable scenario compiled from either front-end. */
export interface ScenarioIR {
  name: string;
  steps: FlowIRStep[];
  /** Seed variables (e.g. computed at build time by the JS front-end). */
  vars?: Record<string, string>;
  /** Front-end tags (e.g. Gherkin `@soft`), kept for reporting. */
  tags?: string[];
  /** Runner-facing flags (skip/only); absent unless explicitly attached. */
  config?: ScenarioConfigIR;
}

/** A named, parameterized, reusable prompt sequence. */
export interface FlowDefIR {
  name: string;
  /** Declared argument names; the fresh callee scope is seeded with exactly these. */
  params: string[];
  /** Variable names copied back into the caller scope after the flow finishes. */
  returns: string[];
  steps: FlowIRStep[];
  /**
   * Memoization tier. Only 'none' is implemented.
   * TODO(POC): 'once-per-run' should skip re-execution and replay the
   * memoized returns when the flow is called again with identical args.
   */
  memo?: 'none' | 'once-per-run';
}

/** A group of scenarios (Gherkin Feature / JS `feature()` builder). */
export interface FeatureIR {
  name: string;
  scenarios: ScenarioIR[];
}

/** Flow calls may nest at most this deep (scenario itself is depth 0). */
export const MAX_FLOW_CALL_DEPTH = 2;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Variable / param names must be simple identifiers so `{name}` is unambiguous. */
export function assertIdentifier(name: string, where: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(
      `[midscene] ${where}: "${name}" is not a valid variable name (expected /^[A-Za-z_][A-Za-z0-9_]*$/).`,
    );
  }
}
