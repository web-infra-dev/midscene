import type { Agent } from '@midscene/core/agent';
import { assembleContext } from '../context/assembler';
import { extractSkillReferences } from '../general-agent/skills';
import type { GeneralAgentAdapter } from '../general-agent/types';
import type { RuntimeNode, RuntimeNodeContext } from '../runtime';
import type { StepOutput, StepResult, Verdict } from '../types';
import { isBuiltinNode } from '../yaml/types';
import type { OutputStoreImpl } from './output-store';

export interface RunNodeDeps {
  uiAgent: Agent;
  generalAgent: GeneralAgentAdapter;
  runtimeNodes: Record<string, RuntimeNode>;
  outputs: OutputStoreImpl;
  /** Shared engineering-facing state across runtime nodes. */
  state: Record<string, unknown>;
  projectRoot: string;
  caseName: string;
  caseFile: string;
  /** Steps already executed (read-only context for the current node). */
  pastSteps: ReadonlyArray<StepResult>;
  env: NodeJS.ProcessEnv;
}

export interface RunNodeOutcome {
  status: StepResult['status'];
  output?: StepOutput;
  verdict?: Verdict;
  error?: string;
}

/**
 * Execute a single flow step and return its outcome. Throwing is reserved for
 * unexpected engine errors; node-level failures are reported via `status`.
 */
export async function runNode(
  node: string,
  input: unknown,
  deps: RunNodeDeps,
): Promise<RunNodeOutcome> {
  if (isBuiltinNode(node)) {
    switch (node) {
      case 'ui':
        return runUiNode(input as string, deps);
      case 'verify':
        return runJudgmentNode('verify', input as string, deps);
      case 'soft':
        return runJudgmentNode('soft', input as string, deps);
      case 'agent':
        return runAgentNode(input as string, deps);
    }
  }
  return runCustomNode(node, input, deps);
}

async function runUiNode(
  instruction: string,
  deps: RunNodeDeps,
): Promise<RunNodeOutcome> {
  // The UI Agent performs the natural-language action. Errors propagate up so
  // the case fails (RFC §8).
  const acted = await deps.uiAgent.aiAct(instruction);

  let text = typeof acted === 'string' && acted.trim() ? acted.trim() : '';
  if (!text) {
    // Produce a context-facing conclusion grounded in the current screen,
    // honoring any "record these values" request in the instruction.
    text = await deps.uiAgent.aiAsk(
      `In natural language, summarize the result of performing the following instruction on the current screen. If the instruction asked to record or name any values, include them explicitly.\n\nInstruction:\n${instruction}`,
    );
  }

  return { status: 'info', output: { text } };
}

async function runJudgmentNode(
  kind: 'verify' | 'soft',
  instruction: string,
  deps: RunNodeDeps,
): Promise<RunNodeOutcome> {
  const { data, mediaType } = await captureScreenshot(deps.uiAgent);
  const context = assembleContext({
    caseName: deps.caseName,
    pastSteps: deps.pastSteps,
    instruction,
    kind,
  });

  const result = await deps.generalAgent.run({
    kind,
    instruction,
    context,
    screenshotBase64: data,
    screenshotMediaType: mediaType,
    referencedSkills: extractSkillReferences(instruction),
    projectRoot: deps.projectRoot,
  });

  // Fail-closed: a missing/unparseable verdict is treated as failure (RFC §6).
  const verdict: Verdict = result.verdict ?? {
    pass: false,
    reason:
      'The agent did not report a verdict via report_verdict; treated as failure (fail-closed).',
  };

  const output: StepOutput = {
    text: result.text || verdict.reason,
  };

  if (verdict.pass) {
    return { status: 'passed', output, verdict };
  }
  // verify gates the case; soft only warns.
  return {
    status: kind === 'verify' ? 'failed' : 'warning',
    output,
    verdict,
  };
}

async function runAgentNode(
  instruction: string,
  deps: RunNodeDeps,
): Promise<RunNodeOutcome> {
  const { data, mediaType } = await captureScreenshot(deps.uiAgent);
  const context = assembleContext({
    caseName: deps.caseName,
    pastSteps: deps.pastSteps,
    instruction,
    kind: 'agent',
  });

  // `agent` is advisory: its output never changes pass/fail. Even internal
  // errors are downgraded to a warning (RFC §8).
  try {
    const result = await deps.generalAgent.run({
      kind: 'agent',
      instruction,
      context,
      screenshotBase64: data,
      screenshotMediaType: mediaType,
      referencedSkills: extractSkillReferences(instruction),
      projectRoot: deps.projectRoot,
    });
    return { status: 'info', output: { text: result.text } };
  } catch (err) {
    return {
      status: 'warning',
      error: `agent node error (advisory, non-gating): ${(err as Error).message}`,
    };
  }
}

async function runCustomNode(
  node: string,
  input: unknown,
  deps: RunNodeDeps,
): Promise<RunNodeOutcome> {
  const runtimeNode = deps.runtimeNodes[node];
  if (!runtimeNode) {
    throw new Error(
      `[midscene] Unknown node "${node}". It is not a built-in node and is not registered under \`runtime\` in midscene.config.ts.`,
    );
  }

  const ctx: RuntimeNodeContext = {
    uiAgent: deps.uiAgent,
    outputs: deps.outputs,
    state: deps.state,
    result: {
      name: deps.caseName,
      file: deps.caseFile,
      steps: deps.pastSteps,
    },
    env: deps.env,
  };

  // A runtime node that throws fails the case (RFC §8).
  const result = await runtimeNode(input, ctx);
  return {
    status: 'info',
    output: { text: result.conclusion, structured: result.output },
  };
}

async function captureScreenshot(
  agent: Agent,
): Promise<{ data?: string; mediaType: string }> {
  try {
    const raw = await agent.interface.screenshotBase64();
    return splitDataUrl(raw);
  } catch {
    return { data: undefined, mediaType: 'image/png' };
  }
}

function splitDataUrl(value: string): { data: string; mediaType: string } {
  const match = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(value);
  if (match) {
    return { mediaType: match[1], data: match[2] };
  }
  return { mediaType: 'image/png', data: value };
}
