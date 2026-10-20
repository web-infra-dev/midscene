import {
  createExecutionContext,
  supportsAsyncContext,
} from '#yaml-execution-context';
import { WorkflowError } from '../test-runner/errors';
import type { WorkflowExecutionRecord } from '../test-runner/execution-record';

interface YamlExecutionSession {
  agent: object;
  children: WorkflowExecutionRecord[];
  finished: boolean;
  finish(record?: WorkflowExecutionRecord): void;
}

interface ExecutionFrame {
  parent?: ExecutionFrame;
  session?: YamlExecutionSession;
  signals: WeakMap<object, { signal: AbortSignal }[]>;
}

const stateKey = Symbol.for('@midscene/core/yaml-execution-session/v2');
const host = globalThis as typeof globalThis & {
  [stateKey]?: {
    sessions: WeakMap<object, YamlExecutionSession[]>;
    signals: WeakMap<object, { signal: AbortSignal }[]>;
    context: ReturnType<typeof createExecutionContext<ExecutionFrame>>;
  };
};
host[stateKey] ??= {
  sessions: new WeakMap(),
  signals: new WeakMap(),
  context: createExecutionContext<ExecutionFrame>(),
};
const { sessions, signals, context } = host[stateKey];

/** Every entry gets its own async frame, shared across CJS and ESM copies. */
export function runInYamlExecutionContext<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const frame: ExecutionFrame = {
    parent: context.getStore(),
    signals: new WeakMap(),
  };
  return context.run(frame, async () => {
    try {
      return await callback();
    } finally {
      frame.session?.finish();
    }
  });
}

export const currentYamlSignal = (agent: object): AbortSignal | undefined => {
  if (!supportsAsyncContext) return signals.get(agent)?.at(-1)?.signal;
  for (let frame = context.getStore(); frame; frame = frame.parent) {
    const signal = frame.signals.get(agent)?.at(-1)?.signal;
    if (signal) return signal;
  }
  return undefined;
};

export function enterYamlAction(
  agent: object,
  signal: AbortSignal,
): () => void {
  const scopeSignals = supportsAsyncContext
    ? context.getStore()?.signals
    : signals;
  if (!scopeSignals)
    throw new Error('YAML action requires an execution context.');
  const stack = scopeSignals.get(agent) ?? [];
  scopeSignals.set(agent, stack);
  const entry = { signal };
  stack.push(entry);
  return () => {
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) scopeSignals.delete(agent);
  };
}

export class YamlExecutionOwnershipError extends WorkflowError {}

/** Nested runs borrow ownership. They never finalize or drain their parent. */
export function enterYamlExecution(
  agent: object,
  options: { allowIndependentOverlap?: boolean } = {},
) {
  const stack = sessions.get(agent) ?? [];
  const frame = context.getStore();
  let parent = supportsAsyncContext ? undefined : stack.at(-1);
  if (supportsAsyncContext) {
    if (!frame || frame.session)
      throw new Error('YAML execution requires a fresh execution context.');
    for (let owner = frame.parent; owner; owner = owner.parent) {
      if (owner.session?.agent === agent) {
        parent = owner.session;
        break;
      }
    }
    if (parent?.finished)
      throw new YamlExecutionOwnershipError(
        'Cannot start nested YAML after its owning execution has finished.',
        { code: 'YAML_EXECUTION_SCOPE_CLOSED' },
      );
    if (stack.at(-1) !== parent && !options.allowIndependentOverlap)
      throw new YamlExecutionOwnershipError(
        'The same Agent cannot run independent overlapping YAML executions. Await the active run before starting another.',
        { code: 'YAML_EXECUTION_OVERLAP' },
      );
  }
  const session: YamlExecutionSession = {
    agent,
    children: [],
    finished: false,
    finish(record?: WorkflowExecutionRecord) {
      if (session.finished) return;
      session.finished = true;
      const index = stack.indexOf(session);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) sessions.delete(agent);
      if (record) parent?.children.push(record);
      else parent?.children.push(...session.children);
    },
  };
  stack.push(session);
  sessions.set(agent, stack);
  if (frame) frame.session = session;
  return {
    isRoot: !parent,
    children: session.children,
    finish: session.finish,
  };
}
