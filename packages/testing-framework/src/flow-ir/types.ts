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

/**
 * A natural-language prompt step. Lowers 1:1 onto an engine node:
 * given/when-like → `ui`, then-like → `verify` (fail-closed), soft variants →
 * `soft`, advisory → `agent`. The authoring keyword fully determines `node`,
 * so the keyword itself is not stored.
 */
export interface PromptStepIR {
  kind: 'prompt';
  node: BuiltinNodeType;
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
   * Memoization tier. With 'once-per-run', a successful completion is stored
   * in the run's {@link FlowMemoStore} (keyed by flow name + resolved args);
   * a later call with identical args skips the flow's steps and replays the
   * memoized returns into the caller scope. Failed runs are never memoized.
   * Defaults to 'none' (every call executes).
   */
  memo?: 'none' | 'once-per-run';
}

/**
 * Memo table for `memo: 'once-per-run'` flows: cache key → the returns of a
 * fully successful completion. `runScenario` defaults to a fresh per-call
 * store; pass one Map to several `runScenario` calls to share memoized flows
 * (e.g. a login) across the scenarios of one run.
 */
export type FlowMemoStore = Map<string, Record<string, string>>;

/** Cache key for a memoized flow call: flow name + resolved args. */
export function flowMemoKey(
  flowName: string,
  resolvedArgs: Record<string, string>,
): string {
  // resolvedArgs is built in declared-param order, so the JSON is stable.
  return `${flowName}\u0000${JSON.stringify(resolvedArgs)}`;
}

/**
 * A compiled feature: runnable scenarios plus the flow definitions authored
 * alongside them. Both front-ends return this exact shape — the Gherkin
 * compiler (`compileFeature`, where `CompiledFeature` is an alias of this
 * type) and the JS `feature()` builder — so callers can build a registry
 * from `.flows` and run `.scenarios` without caring about the surface.
 */
export interface FeatureIR {
  name: string;
  /** Runnable scenarios (in Gherkin: everything not tagged `@flow`). */
  scenarios: ScenarioIR[];
  /** Flow definitions, ready for a {@link FlowRegistry}. */
  flows: FlowDefIR[];
}

/** Flow calls may nest at most this deep (scenario itself is depth 0). */
export const MAX_FLOW_CALL_DEPTH = 2;

/** Source pattern for identifiers, for composing into larger regexes. */
export const IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';

const IDENTIFIER = new RegExp(`^${IDENTIFIER_PATTERN}$`);

/** Variable / param names must be simple identifiers so `{name}` is unambiguous. */
export function assertIdentifier(name: string, where: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(
      `[midscene] ${where}: "${name}" is not a valid variable name (expected /^${IDENTIFIER_PATTERN}$/).`,
    );
  }
}

/**
 * Validate keys as identifiers and stringify values — the normalization every
 * front-end applies to user-supplied vars/args records.
 */
export function stringifyVarRecord(
  record: Record<string, string | number | boolean>,
  where: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    assertIdentifier(key, where);
    out[key] = String(value);
  }
  return out;
}
