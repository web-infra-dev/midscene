import type { Agent } from '@midscene/core/agent';
import type { GeneralAgentAdapter } from '../general-agent/types';
import type { RuntimeNode } from '../runtime';
import type { CaseResult, StepResult } from '../types';
import type { ParsedCase } from '../yaml/types';
import { OutputStoreImpl } from './output-store';
import { type RunNodeDeps, runNode } from './run-node';

export interface RunCaseOptions {
  parsed: ParsedCase;
  file: string;
  uiAgent: Agent;
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

    steps.push(stepResult);
    if (stepResult.output) {
      outputs.add(step.node, index, stepResult.output);
    }
    if (stepResult.status === 'warning' && stepResult.error) {
      warnings.push(stepResult.error);
    }
    if (stepResult.status === 'warning' && stepResult.verdict) {
      warnings.push(
        `soft check failed at step ${index + 1} (${step.node}): ${stepResult.verdict.reason}`,
      );
    }

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

function getReportFile(agent: Agent): string | undefined {
  const candidate = (agent as unknown as { reportFile?: string | null })
    .reportFile;
  return candidate ?? undefined;
}
