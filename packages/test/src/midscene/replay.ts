import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type AgentTestRunnerNodeDefinition,
  type StepReplayInput,
  isNativeExecutionTerminalError,
} from '@midscene/core/agent/test';
import {
  isFatalDeviceError,
  isResourceAdmissionError,
} from '@midscene/core/internal/test-runner';
import { getDebug } from '@midscene/shared/logger';
import type { NodeExecutionContext } from '../node/types';

export type ReplayMode = 'auto' | 'strict' | 'off';
export interface ReplayEvent {
  node: string;
  sourcePath: string;
  scopeId: string;
  workflowPhase: string;
  stepIndex: number;
  attemptIndex: number;
  script?: string;
  [key: string]: unknown;
}
export interface ReplayExecutionOptions {
  replay?: ReplayMode;
  projectRoot?: string;
  onReplayEvent?(event: ReplayEvent): void;
  afterAgentNode?(
    ctx: NodeExecutionContext<any, any>,
    agent: unknown,
    outcome: { status: 'success' | 'failed'; error?: unknown },
  ): Promise<void> | void;
  /** Authoring hook; resources remain owned by the current Runner invocation. */
  beforeAgentNode?(
    ctx: NodeExecutionContext<any, any>,
    agent: unknown,
  ): Promise<void> | void;
}

// Config modules may use the CJS entry while the CLI uses ESM.
const key = Symbol.for('midscene.test.replay');
const globals = globalThis as typeof globalThis & {
  [key]?: AsyncLocalStorage<ReplayExecutionOptions>;
};
globals[key] ??= new AsyncLocalStorage<ReplayExecutionOptions>();
const execution = globals[key];
export const withReplayExecution = <T>(
  options: ReplayExecutionOptions,
  run: () => T,
): T => execution.run(options, run);
export const replayExecution = () => execution.getStore() ?? {};
export function replayMode(value: unknown): ReplayMode {
  if (value === undefined) return 'auto';
  if (value !== 'auto' && value !== 'strict' && value !== 'off')
    throw new TypeError('replay must be auto, strict or off.');
  return value;
}

const warn = getDebug('test:replay', { console: true });

/** The adapter only chooses an implementation. The native definition owns results. */
export async function executeWithReplay(
  definition: AgentTestRunnerNodeDefinition,
  agent: unknown,
  ctx: NodeExecutionContext<Record<string, unknown>, any>,
) {
  const settings = replayExecution();
  const { replay, ...input } = ctx.input;
  const native = () => definition.execute(agent, input, { signal: ctx.signal });
  if (
    replay === undefined ||
    settings.replay === 'off' ||
    !definition.replayResult
  )
    return native();
  const position = ctx.scope === 'case' ? ctx.case : ctx.document;
  const sourcePath = resolve(
    settings.projectRoot ?? process.cwd(),
    position.sourcePath,
  );
  const reference = replay as StepReplayInput;
  const script = resolve(
    dirname(sourcePath),
    typeof reference === 'string' ? reference : reference.script,
  );
  const events: ReplayEvent[] = [];
  const publish = (event: Record<string, unknown>) => {
    const value: ReplayEvent = {
      ...event,
      node: definition.name,
      sourcePath,
      script,
      scopeId:
        ctx.scope === 'case' ? ctx.case.runId : ctx.document.documentRunId,
      workflowPhase: position.phase,
      stepIndex: position.stepIndex,
      attemptIndex: ctx.scope === 'case' ? ctx.case.attemptIndex : 0,
    };
    events.push(value);
    settings.onReplayEvent?.(value);
  };
  let scriptFailure: unknown;
  let failed = false;
  let scriptCompleted = false;
  let output: ReturnType<NonNullable<typeof definition.replayResult>>;
  try {
    ctx.signal.throwIfAborted();
    // Resolve from the user's project; Test itself has no required Replay/Web dependency.
    const sdkPath = createRequire(sourcePath).resolve('@midscene/replay');
    const sdk = await import(pathToFileURL(sdkPath).href);
    const module = await import(pathToFileURL(script).href);
    const raw = await sdk.runReplayStep(agent, module.default, {
      input: structuredClone(input),
      params:
        typeof reference === 'string'
          ? {}
          : structuredClone(reference.params ?? {}),
      signal: ctx.signal,
      strict: settings.replay === 'strict',
      ...(definition.name.split('.').at(-1) === 'aiWaitFor'
        ? {
            waitTimeoutMs:
              (input.options as { timeoutMs?: number })?.timeoutMs ?? 15000,
            waitIntervalMs:
              (input.options as { checkIntervalMs?: number })
                ?.checkIntervalMs ?? 3000,
          }
        : {}),
      onEvent: publish,
    });
    ctx.signal.throwIfAborted();
    // A returned assertion is a node outcome, not a failed script attempt.
    // Keep conversion errors in the report, but never ask AI to overturn them.
    scriptCompleted = true;
    output = definition.replayResult(raw, input);
    publish({ type: 'implementation', path: 'replay', status: 'passed' });
  } catch (error) {
    failed = true;
    scriptFailure = error;
    publish({
      type: 'implementation',
      path: 'replay',
      status: 'failed',
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    });
  }
  const terminal =
    ctx.signal.aborted ||
    isNativeExecutionTerminalError(scriptFailure) ||
    isResourceAdmissionError(scriptFailure) ||
    isFatalDeviceError(scriptFailure);
  const fallback =
    failed && !scriptCompleted && settings.replay !== 'strict' && !terminal;
  if (fallback) publish({ type: 'native-fallback', path: 'native' });
  // Keep script evidence inside this same node before native execution can change the page.
  // recordToReport contributes to runAgentCall's normal trace and immutable snapshot.
  if (
    !ctx.signal.aborted &&
    typeof (agent as { recordToReport?: unknown })?.recordToReport ===
      'function'
  ) {
    try {
      await (
        agent as {
          recordToReport(
            title: string,
            options: { content: string },
          ): Promise<unknown>;
        }
      ).recordToReport(
        `Replay · ${definition.name} · ${failed ? 'failed' : 'passed'}${fallback ? ' → native' : ''}`,
        { content: JSON.stringify({ script, events }, null, 2) },
      );
    } catch (error) {
      if (!failed) throw error;
      warn(`Could not capture Replay failure evidence: ${String(error)}`);
    }
  }
  ctx.signal.throwIfAborted();
  if (fallback) return native();
  if (failed) throw scriptFailure;
  return output;
}
