import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NodeExecutionError,
  NodeInputValidationError,
  StepTimeoutError,
  WorkflowEngine,
  defineNode,
  runStep,
} from '../src';

afterEach(() => {
  vi.useRealTimers();
});

describe('workflow runner', () => {
  it('runs nodes sequentially with normalized input and metadata', async () => {
    const calls: string[] = [];
    const first = defineNode<{ value: number }, { doubled: number }>({
      name: 'first.node',
      execute(ctx) {
        calls.push(ctx.input.prompt ?? '');
        expect(ctx.input).toEqual({ prompt: 'run first', value: 2 });
        expect(ctx.$).toEqual({ continueOnError: false });
        expect(ctx.signal.aborted).toBe(false);
        return { summary: 'done', data: { doubled: ctx.input.value * 2 } };
      },
    });
    const second = defineNode({
      name: 'second.node',
      async execute() {
        calls.push('second');
      },
    });
    const engine = new WorkflowEngine({ nodes: [first, second] });

    const result = await engine.run({
      workflow: [
        { 'first.node': { prompt: 'run first', value: 2 } },
        { 'second.node': {} },
      ],
    });

    expect(calls).toEqual(['run first', 'second']);
    expect(result.status).toBe('success');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({
      node: 'first.node',
      status: 'success',
      continuedAfterError: false,
      output: { summary: 'done', data: { doubled: 4 } },
    });
    expect(result.steps[1].output).toBeUndefined();
  });

  it('records a failed step and continues when configured', async () => {
    const next = vi.fn();
    const engine = new WorkflowEngine({
      nodes: [
        defineNode({
          name: 'failing.node',
          execute() {
            throw new Error('boom');
          },
        }),
        defineNode({ name: 'next.node', execute: next }),
      ],
    });

    const result = await engine.run({
      workflow: [
        { 'failing.node': { $: { 'continue-on-error': true } } },
        { 'next.node': 'keep going' },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.steps[0]).toMatchObject({
      status: 'failed',
      continuedAfterError: true,
      error: { code: 'NODE_EXECUTION_ERROR', node: 'failing.node' },
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws normalized errors and stops by default', async () => {
    const next = vi.fn();
    const engine = new WorkflowEngine({
      nodes: [
        defineNode({
          name: 'failing.node',
          execute() {
            throw new Error('boom');
          },
        }),
        defineNode({ name: 'next.node', execute: next }),
      ],
    });

    await expect(
      engine.run({
        workflow: [{ 'failing.node': {} }, { 'next.node': {} }],
      }),
    ).rejects.toBeInstanceOf(NodeExecutionError);
    expect(next).not.toHaveBeenCalled();
  });

  it('resolves every node before starting workflow side effects', async () => {
    const first = vi.fn();
    const engine = new WorkflowEngine({
      nodes: [defineNode({ name: 'first.node', execute: first })],
    });

    await expect(
      engine.run({
        workflow: [{ 'first.node': {} }, { 'missing.node': {} }],
      }),
    ).rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
    expect(first).not.toHaveBeenCalled();
  });

  it('preserves workflow errors thrown by a node', async () => {
    const validationError = new NodeInputValidationError('prompt is required');
    const node = defineNode({
      name: 'validating.node',
      execute() {
        throw validationError;
      },
    });

    await expect(
      runStep(
        {
          node: node.name,
          input: {},
          meta: { continueOnError: false },
        },
        node,
      ),
    ).rejects.toBe(validationError);
  });

  it('aborts and fails a timed out node even if it never settles', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const node = defineNode({
      name: 'slow.node',
      execute(ctx) {
        signal = ctx.signal;
        return new Promise<void>(() => {});
      },
    });
    const execution = runStep(
      {
        node: node.name,
        input: {},
        meta: { timeoutMs: 50, continueOnError: true },
      },
      node,
    );

    await vi.advanceTimersByTimeAsync(50);
    const result = await execution;

    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBeInstanceOf(StepTimeoutError);
    expect(result.status).toBe('failed');
    expect(result.error).toBeInstanceOf(StepTimeoutError);
    expect((result.error as StepTimeoutError).timeoutMs).toBe(50);
  });

  it('treats invalid runtime node output as execution failure', async () => {
    const node = defineNode({
      name: 'invalid-output.node',
      execute: () => 'not a node result' as never,
    });

    await expect(
      runStep(
        {
          node: node.name,
          input: {},
          meta: { continueOnError: false },
        },
        node,
      ),
    ).rejects.toBeInstanceOf(NodeExecutionError);
  });

  it('passes an explicit context to legacy WorkflowEngine nodes', async () => {
    const calls: string[] = [];
    const engine = new WorkflowEngine<{ value: string }>({
      nodes: [
        defineNode<unknown, unknown, { value: string }>({
          name: 'context.node',
          execute(ctx) {
            calls.push(`node:${ctx.context.value}`);
          },
        }),
      ],
      context: { value: 'ready' },
    });

    await engine.run({ workflow: [{ 'context.node': {} }] });
    expect(calls).toEqual(['node:ready']);
  });
});
