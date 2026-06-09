import type { GeneralAgentAdapter } from '../general-agent/types';
import type { RuntimeNode } from '../runtime';
import type { CaseResult, StepResult, UiAgentLike } from '../types';
import type { ParsedCase } from '../yaml/types';
import { OutputStoreImpl } from './output-store';
import { type RunNodeDeps, runNode } from './run-node';

export interface RunCaseOptions {
  parsed: ParsedCase;
  file: string;
  uiAgent: UiAgentLike;
  generalAgent: GeneralAgentAdapter;
  runtimeNodes: Record<string, RuntimeNode>;
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}

/**
 * Execute a single case (one parsed flow). Returns a structured result; never
 * throws for node-level failures (those are recorded as failed steps).
 */
export async function runCase(options: RunCaseOptions): Promise<CaseResult> {
  const {
    parsed,
    file,
    uiAgent,
    generalAgent,
    runtimeNodes,
    projectRoot,
    env,
  } = options;
  const caseName = parsed.name ?? file;

  const outputs = new OutputStoreImpl();
  const state: Record<string, unknown> = {};
  const steps: StepResult[] = [];
  const warnings: string[] = [];
  const startedAt = Date.now();
  let status: CaseResult['status'] = 'passed';

  for (let index = 0; index < parsed.flow.length; index++) {
    const step = parsed.flow[index];
    const stepStart = Date.now();

    const deps: RunNodeDeps = {
      uiAgent,
      generalAgent,
      runtimeNodes,
      outputs,
      state,
      projectRoot,
      caseName,
      caseFile: file,
      pastSteps: steps,
      env,
    };

    let stepResult: StepResult;
    try {
      const outcome = await runNode(step.node, step.input, deps);
      stepResult = {
        index,
        node: step.node,
        input: step.input,
        status: outcome.status,
        output: outcome.output,
        verdict: outcome.verdict,
        error: outcome.error,
        durationMs: Date.now() - stepStart,
      };
    } catch (err) {
      // Hard failure: ui action threw, runtime node threw, unknown node, etc.
      stepResult = {
        index,
        node: step.node,
        input: step.input,
        status: 'failed',
        error: (err as Error).message,
        durationMs: Date.now() - stepStart,
      };
    }

    recordStepResult(stepResult, { steps, outputs, warnings });

    if (stepResult.status === 'failed') {
      // A gating failure stops the flow; later steps depend on prior ones.
      status = 'failed';
      break;
    }
  }

  return {
    name: caseName,
    file,
    status,
    steps,
    warnings,
    durationMs: Date.now() - startedAt,
    reportFile: getReportFile(uiAgent),
  };
}

/** Shared step bookkeeping, also used by the flow-IR executor. */
export function recordStepResult(
  stepResult: StepResult,
  sink: {
    steps: StepResult[];
    outputs: OutputStoreImpl;
    warnings: string[];
  },
): void {
  sink.steps.push(stepResult);
  if (stepResult.output) {
    sink.outputs.add(stepResult.node, stepResult.index, stepResult.output);
  }
  if (stepResult.status === 'warning' && stepResult.error) {
    sink.warnings.push(stepResult.error);
  }
  if (stepResult.status === 'warning' && stepResult.verdict) {
    sink.warnings.push(
      `soft check failed at step ${stepResult.index + 1} (${stepResult.node}): ${stepResult.verdict.reason}`,
    );
  }
}

export function getReportFile(agent: UiAgentLike): string | undefined {
  return agent.reportFile ?? undefined;
}
