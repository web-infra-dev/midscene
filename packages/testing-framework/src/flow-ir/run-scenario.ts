/**
 * POC: the flow-IR executor. Walks a {@link ScenarioIR} and lowers each IR
 * step onto the existing Phase 0 engine:
 *
 *  - `prompt` steps → `runNode` with the engine's ui / verify / soft / agent
 *    semantics (verify gates fail-closed, soft only warns, agent is advisory);
 *  - `capture` steps → a structured extraction via the UI agent
 *    (`aiString`), with the result written into the machine-owned variable
 *    table for the current scope;
 *  - `callFlow` steps → recursive execution of the registered flow with a
 *    fresh variable scope (declared args only), declared returns copied back
 *    to the caller scope, and a hard cap on call depth.
 *
 * All templates go through mechanical `{varName}` substitution before any
 * model sees them.
 */
import type { Agent } from '@midscene/core/agent';
import { OutputStoreImpl } from '../engine/output-store';
import { type RunNodeDeps, runNode } from '../engine/run-node';
import type { GeneralAgentAdapter } from '../general-agent/types';
import type { RuntimeNode } from '../runtime';
import type { CaseResult, StepResult } from '../types';
import { FlowRegistry } from './registry';
import { type VariableScope, substitute } from './substitute';
import {
  type CallFlowStepIR,
  type CaptureStepIR,
  type FlowIRStep,
  MAX_FLOW_CALL_DEPTH,
  type PromptStepIR,
  type ScenarioIR,
} from './types';

/**
 * Observability events emitted while a scenario runs (e.g. for the demo's
 * narrated walkthrough). Purely informational — handlers cannot alter
 * execution.
 */
export type ScenarioRunEvent =
  | {
      type: 'stepStart';
      index: number;
      node: string;
      /** Resolved input (after `{var}` substitution). */
      input: string;
      /** The authored template, when it differs from the resolved input. */
      template?: string;
      depth: number;
    }
  | { type: 'stepEnd'; result: StepResult; depth: number }
  | {
      type: 'varSet';
      name: string;
      value: string;
      source: 'seed' | 'capture' | 'return';
      depth: number;
    }
  | {
      type: 'flowEnter';
      flowName: string;
      args: Record<string, string>;
      depth: number;
    }
  | {
      type: 'flowExit';
      flowName: string;
      returns: Record<string, string>;
      depth: number;
    };

export interface RunScenarioOptions {
  scenario: ScenarioIR;
  /** Resolves `callFlow` steps. Defaults to an empty registry. */
  registry?: FlowRegistry;
  /** Source file the scenario came from, for reporting. */
  file?: string;
  uiAgent: Agent;
  generalAgent: GeneralAgentAdapter;
  runtimeNodes?: Record<string, RuntimeNode>;
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
  /** Optional observer for narration/debugging. */
  onEvent?: (event: ScenarioRunEvent) => void;
}

/** A {@link CaseResult} plus the final machine-owned variable table. */
export interface ScenarioRunResult extends CaseResult {
  /** Top-level scope after the run (captures + seed vars + flow returns). */
  variables: Record<string, string>;
}

interface ExecCtx {
  registry: FlowRegistry;
  uiAgent: Agent;
  generalAgent: GeneralAgentAdapter;
  runtimeNodes: Record<string, RuntimeNode>;
  projectRoot: string;
  env: NodeJS.ProcessEnv;
  caseName: string;
  caseFile: string;
  outputs: OutputStoreImpl;
  state: Record<string, unknown>;
  steps: StepResult[];
  warnings: string[];
  emit: (event: ScenarioRunEvent) => void;
}

/**
 * Execute one compiled scenario. Mirrors the engine's `runCase` contract:
 * never throws for step-level failures; a gating failure stops the flow.
 */
export async function runScenario(
  options: RunScenarioOptions,
): Promise<ScenarioRunResult> {
  const { scenario } = options;
  const ctx: ExecCtx = {
    registry: options.registry ?? new FlowRegistry(),
    uiAgent: options.uiAgent,
    generalAgent: options.generalAgent,
    runtimeNodes: options.runtimeNodes ?? {},
    projectRoot: options.projectRoot ?? process.cwd(),
    env: options.env ?? process.env,
    caseName: scenario.name,
    caseFile: options.file ?? '<ir>',
    outputs: new OutputStoreImpl(),
    state: {},
    steps: [],
    warnings: [],
    emit: options.onEvent ?? (() => {}),
  };

  const scope: VariableScope = new Map(Object.entries(scenario.vars ?? {}));
  for (const [name, value] of scope) {
    ctx.emit({ type: 'varSet', name, value, source: 'seed', depth: 0 });
  }
  const startedAt = Date.now();

  const ok = await execSteps(scenario.steps, scope, 0, ctx);

  return {
    name: scenario.name,
    file: ctx.caseFile,
    status: ok ? 'passed' : 'failed',
    steps: ctx.steps,
    warnings: ctx.warnings,
    durationMs: Date.now() - startedAt,
    reportFile: getReportFile(ctx.uiAgent),
    variables: Object.fromEntries(scope),
  };
}

/** Returns false when a gating failure stopped execution. */
async function execSteps(
  steps: FlowIRStep[],
  scope: VariableScope,
  depth: number,
  ctx: ExecCtx,
): Promise<boolean> {
  for (const step of steps) {
    const ok = await execStep(step, scope, depth, ctx);
    if (!ok) return false;
  }
  return true;
}

async function execStep(
  step: FlowIRStep,
  scope: VariableScope,
  depth: number,
  ctx: ExecCtx,
): Promise<boolean> {
  switch (step.kind) {
    case 'prompt':
      return execPromptStep(step, scope, depth, ctx);
    case 'capture':
      return execCaptureStep(step, scope, depth, ctx);
    case 'callFlow':
      return execCallFlowStep(step, scope, depth, ctx);
  }
}

async function execPromptStep(
  step: PromptStepIR,
  scope: VariableScope,
  depth: number,
  ctx: ExecCtx,
): Promise<boolean> {
  const index = ctx.steps.length;
  const stepStart = Date.now();

  let stepResult: StepResult;
  try {
    const resolved = substitute(
      step.template,
      scope,
      `${ctx.caseName} step ${index + 1} (${step.node})`,
    );
    ctx.emit({
      type: 'stepStart',
      index,
      node: step.node,
      input: resolved,
      template: resolved === step.template ? undefined : step.template,
      depth,
    });
    const outcome = await runNode(step.node, resolved, nodeDeps(ctx));
    stepResult = {
      index,
      node: step.node,
      input: resolved,
      status: outcome.status,
      output: outcome.output,
      verdict: outcome.verdict,
      error: outcome.error,
      durationMs: Date.now() - stepStart,
    };
  } catch (err) {
    stepResult = {
      index,
      node: step.node,
      input: step.template,
      status: 'failed',
      error: (err as Error).message,
      durationMs: Date.now() - stepStart,
    };
  }

  recordStep(stepResult, depth, ctx);
  return stepResult.status !== 'failed';
}

async function execCaptureStep(
  step: CaptureStepIR,
  scope: VariableScope,
  depth: number,
  ctx: ExecCtx,
): Promise<boolean> {
  const index = ctx.steps.length;
  const stepStart = Date.now();

  let stepResult: StepResult;
  try {
    const resolved = substitute(
      step.template,
      scope,
      `${ctx.caseName} step ${index + 1} (capture ${step.varName})`,
    );
    ctx.emit({
      type: 'stepStart',
      index,
      node: 'capture',
      input: resolved,
      template: resolved === step.template ? undefined : step.template,
      depth,
    });
    // Lower to a structured extraction on the UI agent. The value is
    // machine-owned: it goes into the variable table, not into model prose.
    const value = await ctx.uiAgent.aiString(resolved);
    if (!value.trim()) {
      // Fail fast instead of letting a blank variable poison later prompts
      // (e.g. the value is not visible on the current screen).
      throw new Error(
        `[midscene] capture {${step.varName}}: the extraction "${resolved}" returned an empty value. Is it visible on the current screen?`,
      );
    }
    scope.set(step.varName, value);
    ctx.emit({
      type: 'varSet',
      name: step.varName,
      value,
      source: 'capture',
      depth,
    });

    stepResult = {
      index,
      node: 'capture',
      input: resolved,
      status: 'info',
      output: {
        text: `Captured variable {${step.varName}} = ${JSON.stringify(value)} (${resolved}).`,
        structured: { [step.varName]: value },
      },
      durationMs: Date.now() - stepStart,
    };
  } catch (err) {
    stepResult = {
      index,
      node: 'capture',
      input: step.template,
      status: 'failed',
      error: (err as Error).message,
      durationMs: Date.now() - stepStart,
    };
  }

  recordStep(stepResult, depth, ctx);
  return stepResult.status !== 'failed';
}

async function execCallFlowStep(
  step: CallFlowStepIR,
  scope: VariableScope,
  depth: number,
  ctx: ExecCtx,
): Promise<boolean> {
  const index = ctx.steps.length;
  const stepStart = Date.now();
  const where = `${ctx.caseName} step ${index + 1} (flow "${step.flowName}")`;

  let childScope: VariableScope;
  let resolvedArgs: Record<string, string>;
  try {
    if (depth + 1 > MAX_FLOW_CALL_DEPTH) {
      throw new Error(
        `[midscene] ${where}: flow call depth exceeds the cap of ${MAX_FLOW_CALL_DEPTH}. Flatten the composition instead of nesting deeper.`,
      );
    }
    const flow = ctx.registry.get(step.flowName);

    for (const arg of Object.keys(step.args)) {
      if (!flow.params.includes(arg)) {
        throw new Error(
          `[midscene] ${where}: unknown argument "${arg}". Declared params: ${flow.params.join(', ') || '(none)'}.`,
        );
      }
    }
    resolvedArgs = {};
    childScope = new Map();
    for (const param of flow.params) {
      const template = step.args[param];
      if (template === undefined) {
        throw new Error(
          `[midscene] ${where}: missing argument "${param}" (declared params: ${flow.params.join(', ')}).`,
        );
      }
      // Args are resolved against the CALLER scope; the callee scope is fresh.
      const value = substitute(template, scope, `${where} arg "${param}"`);
      resolvedArgs[param] = value;
      childScope.set(param, value);
    }

    // TODO(POC): flow.memo === 'once-per-run' should look up a per-run memo
    // table keyed by (flowName, resolvedArgs) and replay returns on a hit.
    // For now every call executes.

    ctx.emit({
      type: 'flowEnter',
      flowName: step.flowName,
      args: resolvedArgs,
      depth: depth + 1,
    });
    recordStep(
      {
        index,
        node: 'flow',
        input: formatCall(step.flowName, resolvedArgs),
        status: 'info',
        output: {
          text: `Entering flow "${step.flowName}" with ${formatArgs(resolvedArgs)}.`,
        },
        durationMs: Date.now() - stepStart,
      },
      depth,
      ctx,
    );

    const ok = await execSteps(flow.steps, childScope, depth + 1, ctx);
    if (!ok) return false;

    // Only declared returns flow back; everything else in the callee scope
    // is discarded.
    const returns: Record<string, string> = {};
    for (const ret of flow.returns) {
      const value = childScope.get(ret);
      if (value === undefined) {
        throw new Error(
          `[midscene] ${where}: flow declares return "${ret}" but never captured it.`,
        );
      }
      scope.set(ret, value);
      returns[ret] = value;
      ctx.emit({ type: 'varSet', name: ret, value, source: 'return', depth });
    }
    ctx.emit({
      type: 'flowExit',
      flowName: step.flowName,
      returns,
      depth: depth + 1,
    });
    return true;
  } catch (err) {
    recordStep(
      {
        index: ctx.steps.length,
        node: 'flow',
        input: formatCall(step.flowName, step.args),
        status: 'failed',
        error: (err as Error).message,
        durationMs: Date.now() - stepStart,
      },
      depth,
      ctx,
    );
    return false;
  }
}

function nodeDeps(ctx: ExecCtx): RunNodeDeps {
  return {
    uiAgent: ctx.uiAgent,
    generalAgent: ctx.generalAgent,
    runtimeNodes: ctx.runtimeNodes,
    outputs: ctx.outputs,
    state: ctx.state,
    projectRoot: ctx.projectRoot,
    caseName: ctx.caseName,
    caseFile: ctx.caseFile,
    pastSteps: ctx.steps,
    env: ctx.env,
  };
}

/** Mirror `runCase`'s bookkeeping for outputs and warnings. */
function recordStep(stepResult: StepResult, depth: number, ctx: ExecCtx): void {
  ctx.emit({ type: 'stepEnd', result: stepResult, depth });
  ctx.steps.push(stepResult);
  if (stepResult.output) {
    ctx.outputs.add(stepResult.node, stepResult.index, stepResult.output);
  }
  if (stepResult.status === 'warning' && stepResult.error) {
    ctx.warnings.push(stepResult.error);
  }
  if (stepResult.status === 'warning' && stepResult.verdict) {
    ctx.warnings.push(
      `soft check failed at step ${stepResult.index + 1} (${stepResult.node}): ${stepResult.verdict.reason}`,
    );
  }
}

function formatCall(flowName: string, args: Record<string, string>): string {
  return `${flowName}(${formatArgs(args)})`;
}

function formatArgs(args: Record<string, string>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return 'no arguments';
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
}

function getReportFile(agent: Agent): string | undefined {
  const candidate = (agent as unknown as { reportFile?: string | null })
    .reportFile;
  return candidate ?? undefined;
}
