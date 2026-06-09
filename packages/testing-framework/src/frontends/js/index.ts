/**
 * POC: JS/TS authoring front-end over the shared flow-IR.
 *
 * A fluent, typed API in the spirit of `defineMidsceneConfig` /
 * `defineRuntime`: steps are natural-language strings with `{var}`
 * placeholders, flows are declared with `defineFlow({...})`, and scenarios /
 * features are assembled with `scenario()` / `feature()`. Because everything
 * is plain JS values, dynamic authoring (computed args, conditionals, mapping
 * over data) happens naturally at build time — the output is always the same
 * static IR the Gherkin front-end produces.
 *
 * Keyword→policy mapping:
 *  - `Given(...)` → ui node (setup semantics)
 *  - `When(...)` / bare string → ui node (action)
 *  - `Then(...)` → verify node (fail-closed)
 *  - `Soft(...)` → soft node (warns, never gates)
 *  - `Advisory(...)` → agent node (free-form analysis)
 *  - `remember(description, varName)` → variable capture
 *  - `callFlow(name, args)` → named-flow invocation
 *
 * A third, hybrid mode lives in `./bind-feature`: `bindFeature()` compiles a
 * `.feature` file and applies a sparse JS overlay (see that module's docs).
 */
import {
  type CallFlowStepIR,
  type CaptureStepIR,
  type FeatureIR,
  type FlowDefIR,
  type FlowIRStep,
  type PromptStepIR,
  type ScenarioIR,
  assertIdentifier,
  listPlaceholders,
  stringifyVarRecord,
} from '../../flow-ir';

/** A step in the fluent API: an IR step, or a bare string (= `when`). */
export type StepInput = FlowIRStep | string;

// Note: keyword helpers are capitalized like cucumber-js (`Given`/`When`/
// `Then`). A lowercase `then` export would also make the module namespace a
// thenable, which breaks dynamic `import()` of this module.
export function Given(template: string): PromptStepIR {
  return promptStep('ui', template, 'Given');
}

export function When(template: string): PromptStepIR {
  return promptStep('ui', template, 'When');
}

export function Then(template: string): PromptStepIR {
  return promptStep('verify', template, 'Then');
}

export function Soft(template: string): PromptStepIR {
  return promptStep('soft', template, 'Soft');
}

export function Advisory(template: string): PromptStepIR {
  return promptStep('agent', template, 'Advisory');
}

/** "Remember <description> as {varName}" — machine-owned variable capture. */
export function remember(description: string, varName: string): CaptureStepIR {
  if (!description.trim()) {
    throw new Error('[midscene] remember(): description must not be empty.');
  }
  assertIdentifier(varName, 'remember()');
  return { kind: 'capture', template: description, varName };
}

/** Invoke a registered named flow. Arg values may use `{var}` placeholders. */
export function callFlow(
  flowName: string,
  args: Record<string, string | number | boolean> = {},
): CallFlowStepIR {
  if (!flowName.trim()) {
    throw new Error('[midscene] callFlow(): flow name must not be empty.');
  }
  return {
    kind: 'callFlow',
    flowName,
    args: stringifyVarRecord(args, `callFlow("${flowName}") args`),
  };
}

export interface DefineFlowInput {
  name: string;
  params?: string[];
  returns?: string[];
  steps: StepInput[];
  /** TODO(POC): only 'none' is implemented; 'once-per-run' is accepted but ignored. */
  memo?: 'none' | 'once-per-run';
}

/** Declare a named, parameterized, reusable prompt flow. */
export function defineFlow(input: DefineFlowInput): FlowDefIR {
  if (!input.name?.trim()) {
    throw new Error('[midscene] defineFlow(): a flow must have a name.');
  }
  const params = input.params ?? [];
  const returns = input.returns ?? [];
  for (const param of params) {
    assertIdentifier(param, `defineFlow("${input.name}") params`);
  }
  for (const ret of returns) {
    assertIdentifier(ret, `defineFlow("${input.name}") returns`);
  }
  const steps = normalizeSteps(input.steps, `defineFlow("${input.name}")`);

  validateFlowScoping(input.name, params, returns, steps);

  return { name: input.name, params, returns, steps, memo: input.memo };
}

export interface ScenarioOptions {
  /** Seed variables available to `{var}` placeholders from the first step. */
  vars?: Record<string, string | number | boolean>;
  tags?: string[];
}

/** Assemble a runnable scenario from fluent steps. */
export function scenario(
  name: string,
  steps: StepInput[],
  options: ScenarioOptions = {},
): ScenarioIR {
  if (!name.trim()) {
    throw new Error('[midscene] scenario(): a scenario must have a name.');
  }
  return {
    name,
    steps: normalizeSteps(steps, `scenario("${name}")`),
    vars: stringifyVarRecord(options.vars ?? {}, `scenario("${name}") vars`),
    tags: options.tags ?? [],
  };
}

/** Group scenarios, mirroring a Gherkin Feature. */
export function feature(name: string, scenarios: ScenarioIR[]): FeatureIR {
  if (!name.trim()) {
    throw new Error('[midscene] feature(): a feature must have a name.');
  }
  return { name, scenarios };
}

function promptStep(
  node: PromptStepIR['node'],
  template: string,
  helper: string,
): PromptStepIR {
  if (!template.trim()) {
    throw new Error(`[midscene] ${helper}(): the prompt must not be empty.`);
  }
  return { kind: 'prompt', node, template };
}

/** A bare string in a step list is shorthand for `When(...)`. */
export function normalizeStep(step: StepInput): FlowIRStep {
  return typeof step === 'string' ? When(step) : step;
}

function normalizeSteps(steps: StepInput[], where: string): FlowIRStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`[midscene] ${where}: steps must be a non-empty array.`);
  }
  return steps.map(normalizeStep);
}

// Hybrid mode (Gherkin source of truth + sparse JS overlay). Re-exported
// last: bind-feature imports `normalizeStep` from this module, and keeping
// the cycle edge at the bottom makes the load order explicit.
export { bindFeature, anchorText } from './bind-feature';
export type {
  FeatureOverlay,
  ScenarioOverlay,
  StepOverlay,
  StepAnchor,
} from './bind-feature';

/**
 * Cheap static authoring checks for flows. Calls to other flows make full
 * static analysis impossible without a registry, so the check goes lenient as
 * soon as a `callFlow` step appears; the executor still enforces everything
 * at runtime.
 */
function validateFlowScoping(
  name: string,
  params: string[],
  returns: string[],
  steps: FlowIRStep[],
): void {
  const hasFlowCalls = steps.some((s) => s.kind === 'callFlow');
  const known = new Set(params);

  for (const step of steps) {
    if (step.kind === 'prompt' || step.kind === 'capture') {
      if (!hasFlowCalls) {
        for (const placeholder of listPlaceholders(step.template)) {
          if (!known.has(placeholder)) {
            throw new Error(
              `[midscene] defineFlow("${name}"): {${placeholder}} is not a param and is not captured by an earlier step. Flows get a fresh scope — only declared params and earlier captures are visible.`,
            );
          }
        }
      }
    }
    if (step.kind === 'capture') {
      known.add(step.varName);
    }
  }

  if (!hasFlowCalls) {
    for (const ret of returns) {
      if (!known.has(ret)) {
        throw new Error(
          `[midscene] defineFlow("${name}"): return "${ret}" is neither a param nor captured by any step.`,
        );
      }
    }
  }
}
