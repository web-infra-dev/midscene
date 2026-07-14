import { describe, expect, it, vi } from 'vitest';
import {
  type CollectedWorkflow,
  NodeRegistry,
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
});
