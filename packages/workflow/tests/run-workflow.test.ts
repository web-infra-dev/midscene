import { describe, expect, it, vi } from 'vitest';
import {
  type CollectedWorkflow,
  NodeRegistry,
  WorkflowLifecycleError,
  defineNode,
  runWorkflow,
} from '../src';

const collected = (
  steps: CollectedWorkflow['definition']['steps'],
): CollectedWorkflow => ({
  testId: 'test-id',
  projectId: 'project',
  sourcePath: 'flows/example.yaml',
  workflowIndex: 2,
  definition: { name: 'example workflow', steps },
});

describe('runWorkflow', () => {
  it('runs steps strictly in order and exposes immutable completed history', async () => {
    const calls: string[] = [];
    const first = defineNode({
      name: 'first.node',
      async execute(ctx) {
        expect(ctx.workflow).toMatchObject({
          testId: 'test-id',
          runId: 'run-id',
          sourcePath: 'flows/example.yaml',
          workflowIndex: 2,
          stepIndex: 0,
          completedSteps: [],
        });
        await Promise.resolve();
        calls.push('first');
        return { data: { value: 1 } };
      },
    });
    const second = defineNode({
      name: 'second.node',
      execute(ctx) {
        calls.push('second');
        expect(ctx.workflow.stepIndex).toBe(1);
        expect(ctx.workflow.completedSteps).toHaveLength(1);
        expect(Object.isFrozen(ctx.workflow.completedSteps)).toBe(true);
      },
    });
    const registry = new NodeRegistry([first, second]);

    const result = await runWorkflow(
      collected([
        {
          node: first.name,
          input: {},
          meta: { continueOnError: false },
        },
        {
          node: second.name,
          input: {},
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        createRunId: () => 'run-id',
      },
    );

    expect(calls).toEqual(['first', 'second']);
    expect(result).toMatchObject({
      testId: 'test-id',
      runId: 'run-id',
      name: 'example workflow',
      status: 'success',
      steps: [{ status: 'success' }, { status: 'success' }],
    });
  });

  it('records a non-continuable failure, stops, and persists the result', async () => {
    const next = vi.fn();
    const onResult = vi.fn();
    const failing = defineNode({
      name: 'failing.node',
      execute() {
        throw new Error('boom');
      },
    });
    const registry = new NodeRegistry([
      failing,
      defineNode({ name: 'next.node', execute: next }),
    ]);
    const result = await runWorkflow(
      collected([
        {
          node: failing.name,
          input: {},
          meta: { continueOnError: false },
        },
        {
          node: 'next.node',
          input: {},
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        onResult,
        createRunId: () => 'failed-run',
      },
    );

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      status: 'failed',
      continuedAfterError: false,
      error: { code: 'NODE_EXECUTION_ERROR' },
    });
    expect(next).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(result);
  });

  it('continues after configured errors but keeps the workflow failed', async () => {
    const next = vi.fn();
    const failing = defineNode({
      name: 'failing.node',
      execute() {
        throw new Error('boom');
      },
    });
    const registry = new NodeRegistry([
      failing,
      defineNode({ name: 'next.node', execute: next }),
    ]);
    const result = await runWorkflow(
      collected([
        {
          node: failing.name,
          input: {},
          meta: { continueOnError: true },
        },
        {
          node: 'next.node',
          input: {},
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry) },
    );

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(2);
    expect(next).toHaveBeenCalledOnce();
  });

  it('shares setup context and runs teardown callbacks in reverse order', async () => {
    const context = { value: 1 };
    const receivedContexts: unknown[] = [];
    const lifecycle: string[] = [];
    const node = defineNode<unknown, unknown, typeof context>({
      name: 'context.node',
      execute(ctx) {
        receivedContexts.push(ctx.context);
        ctx.context.value += 1;
      },
    });
    const registry = new NodeRegistry([node]);

    const result = await runWorkflow(
      collected([
        { node: node.name, input: {}, meta: { continueOnError: false } },
        { node: node.name, input: {}, meta: { continueOnError: false } },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        createRunId: () => 'context-run',
        setupWorkflow(setup) {
          expect(setup).toMatchObject({
            testId: 'test-id',
            runId: 'context-run',
            sourcePath: 'flows/example.yaml',
            workflowIndex: 2,
          });
          expect(setup.steps).toHaveLength(2);
          expect(setup.env).not.toBe(process.env);
          expect(Object.isFrozen(setup.env)).toBe(true);
          setup.onTeardown((teardown) => {
            lifecycle.push(`first:${teardown.status}:${context.value}`);
          });
          setup.onTeardown(() => {
            lifecycle.push('second');
          });
          return context;
        },
      },
    );

    expect(result.status).toBe('success');
    expect(receivedContexts).toEqual([context, context]);
    expect(context.value).toBe(3);
    expect(lifecycle).toEqual(['second', 'first:success:3']);
  });

  it('tears down partial setup and skips steps when setup fails', async () => {
    const execute = vi.fn();
    const lifecycle: string[] = [];
    const node = defineNode({ name: 'never.runs', execute });
    const registry = new NodeRegistry([node]);

    const result = await runWorkflow(
      collected([
        { node: node.name, input: {}, meta: { continueOnError: false } },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        createRunId: () => 'setup-failure',
        setupWorkflow({ onTeardown }) {
          onTeardown((ctx) => {
            lifecycle.push(`${ctx.status}:${ctx.setupError?.code}`);
          });
          throw new Error('database unavailable');
        },
      },
    );

    expect(execute).not.toHaveBeenCalled();
    expect(lifecycle).toEqual(['failed:WORKFLOW_SETUP_ERROR']);
    expect(result).toMatchObject({
      status: 'failed',
      steps: [],
      setupError: {
        code: 'WORKFLOW_SETUP_ERROR',
        message: 'Workflow setup failed: database unavailable',
      },
    });
  });

  it('keeps step and all teardown errors and calls onResult last', async () => {
    const lifecycle: string[] = [];
    const node = defineNode({
      name: 'fails',
      execute() {
        lifecycle.push('step');
        throw new Error('step failed');
      },
    });
    const registry = new NodeRegistry([node]);
    const onResult = vi.fn(() => {
      lifecycle.push('result');
    });

    const result = await runWorkflow(
      collected([
        { node: node.name, input: {}, meta: { continueOnError: false } },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        createRunId: () => 'teardown-failure',
        setupWorkflow({ onTeardown }) {
          onTeardown(() => {
            lifecycle.push('teardown:first');
            throw new Error('first failed');
          });
          onTeardown(() => {
            lifecycle.push('teardown:second');
            throw new Error('second failed');
          });
          return undefined;
        },
        onResult,
      },
    );

    expect(lifecycle).toEqual([
      'step',
      'teardown:second',
      'teardown:first',
      'result',
    ]);
    expect(result.steps[0].error?.code).toBe('NODE_EXECUTION_ERROR');
    expect(result.teardownErrors).toHaveLength(2);
    expect(result.teardownErrors?.map((error) => error.code)).toEqual([
      'WORKFLOW_TEARDOWN_ERROR',
      'WORKFLOW_TEARDOWN_ERROR',
    ]);
    expect(result.teardownErrors?.map((error) => error.details)).toEqual([
      { testId: 'test-id', runId: 'teardown-failure', registrationIndex: 1 },
      { testId: 'test-id', runId: 'teardown-failure', registrationIndex: 0 },
    ]);
    expect(onResult).toHaveBeenCalledWith(result);
  });

  it('creates isolated contexts for concurrent attempts', async () => {
    const contexts: Array<{ runId: string }> = [];
    const seen: Array<{ runId: string }> = [];
    const node = defineNode<unknown, unknown, { runId: string }>({
      name: 'read.context',
      execute(ctx) {
        seen.push(ctx.context);
      },
    });
    const registry = new NodeRegistry([node]);
    const workflow = collected([
      { node: node.name, input: {}, meta: { continueOnError: false } },
    ]);
    const run = (runId: string) =>
      runWorkflow(workflow, {
        resolveNode: registry.require.bind(registry),
        createRunId: () => runId,
        setupWorkflow() {
          const context = { runId };
          contexts.push(context);
          return context;
        },
      });

    await Promise.all([run('attempt-a'), run('attempt-b')]);

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).not.toBe(contexts[1]);
    expect(new Set(seen)).toEqual(new Set(contexts));
  });

  it('rejects teardown registration after setup has finished', async () => {
    let lateRegistration: (() => void) | undefined;
    const result = await runWorkflow(collected([]), {
      resolveNode: () => {
        throw new Error('no nodes');
      },
      setupWorkflow({ onTeardown }) {
        lateRegistration = () => onTeardown(() => {});
        return undefined;
      },
    });

    expect(result.status).toBe('success');
    expect(lateRegistration).toBeDefined();
    expect(lateRegistration).toThrow(WorkflowLifecycleError);
  });
});
