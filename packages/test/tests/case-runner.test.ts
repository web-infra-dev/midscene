import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CaseRunner,
  NodeExecutionError,
  NodeInputValidationError,
  StepTimeoutError,
  createCaseRunner,
  defineNode,
  z,
} from '../src';

afterEach(() => {
  vi.useRealTimers();
});

describe('CaseRunner', () => {
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
    const runner = new CaseRunner({ nodes: [first, second] });

    const result = await runner.run({
      name: 'sequential case',
      steps: [
        { 'first.node': { prompt: 'run first', value: 2 } },
        { 'second.node': {} },
      ],
    });

    expect(calls).toEqual(['run first', 'second']);
    expect(result.name).toBe('sequential case');
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
    const runner = new CaseRunner({
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

    const result = await runner.run({
      steps: [
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
    const runner = new CaseRunner({
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
      runner.run({
        steps: [{ 'failing.node': {} }, { 'next.node': {} }],
      }),
    ).rejects.toBeInstanceOf(NodeExecutionError);
    expect(next).not.toHaveBeenCalled();
  });

  it('resolves every node before starting case side effects', async () => {
    const first = vi.fn();
    const runner = new CaseRunner({
      nodes: [defineNode({ name: 'first.node', execute: first })],
    });

    await expect(
      runner.run({
        steps: [{ 'first.node': {} }, { 'missing.node': {} }],
      }),
    ).rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
    expect(first).not.toHaveBeenCalled();
  });

  it('preserves structured errors thrown by a node', async () => {
    const validationError = new NodeInputValidationError('prompt is required');
    const node = defineNode({
      name: 'validating.node',
      execute() {
        throw validationError;
      },
    });
    const runner = new CaseRunner({ nodes: [node] });

    await expect(runner.run({ steps: [{ [node.name]: {} }] })).rejects.toBe(
      validationError,
    );
  });

  it('parses schema input before execution and passes the inferred output', async () => {
    const execute = vi.fn();
    const inputSchema = z.strictObject({
      count: z.coerce.number().int().default(1),
      label: z.string().transform((value) => value.toUpperCase()),
    });
    const node = defineNode({
      name: 'schema.node',
      inputSchema,
      execute(ctx) {
        execute(ctx.input);
      },
    });
    const runner = new CaseRunner({ nodes: [node] });

    await runner.run({
      steps: [{ [node.name]: { count: '2', label: 'ready' } }],
    });

    expect(execute).toHaveBeenCalledWith({ count: 2, label: 'READY' });
  });

  it('normalizes Zod issues without exposing the complete input', async () => {
    const execute = vi.fn();
    const node = defineNode({
      name: 'validated.node',
      inputSchema: z.strictObject({ count: z.number().positive() }),
      execute,
    });
    const runner = new CaseRunner({ nodes: [node] });

    let received: unknown;
    try {
      await runner.run({
        steps: [
          {
            [node.name]: {
              count: -1,
              secret: 'must-not-appear-in-the-error',
            },
          },
        ],
      });
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(NodeInputValidationError);
    expect(received).toMatchObject({
      code: 'NODE_INPUT_VALIDATION_ERROR',
      details: { node: 'validated.node', issues: expect.any(Array) },
    });
    expect(JSON.stringify(received)).not.toContain(
      'must-not-appear-in-the-error',
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('supports asynchronous schema refinements', async () => {
    const execute = vi.fn();
    const node = defineNode({
      name: 'async-schema.node',
      inputSchema: z.strictObject({
        value: z.string().refine(async (value) => value === 'accepted'),
      }),
      execute,
    });
    const runner = new CaseRunner({ nodes: [node] });

    await expect(
      runner.run({ steps: [{ [node.name]: { value: 'rejected' } }] }),
    ).rejects.toBeInstanceOf(NodeInputValidationError);
    expect(execute).not.toHaveBeenCalled();
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
    const runner = new CaseRunner({ nodes: [node] });
    const execution = runner.run({
      steps: [
        {
          [node.name]: {
            $: { timeout: 50, 'continue-on-error': true },
          },
        },
      ],
    });

    await vi.advanceTimersByTimeAsync(50);
    const result = await execution;

    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBeInstanceOf(StepTimeoutError);
    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toBeInstanceOf(StepTimeoutError);
    expect((result.steps[0].error as StepTimeoutError).timeoutMs).toBe(50);
  });

  it('treats invalid runtime node output as execution failure', async () => {
    const node = defineNode({
      name: 'invalid-output.node',
      execute: () => 'not a node result' as never,
    });
    const runner = new CaseRunner({ nodes: [node] });

    await expect(
      runner.run({ steps: [{ [node.name]: {} }] }),
    ).rejects.toBeInstanceOf(NodeExecutionError);
  });

  it('passes an explicit context to standalone CaseRunner nodes', async () => {
    const calls: string[] = [];
    const runner = createCaseRunner<{ value: string }>({
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

    await runner.run({ steps: [{ 'context.node': {} }] });
    expect(calls).toEqual(['node:ready']);
  });
});
