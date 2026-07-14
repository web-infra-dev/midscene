import { describe, expect, it, vi } from 'vitest';
import {
  type CollectedWorkflow,
  NodeRegistry,
  defineNode,
  runWorkflow,
} from '../src';

const step = (node: string, continueOnError = false) => ({
  node,
  input: {},
  meta: { continueOnError },
});

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
  it('runs all attempt phases in order with one context and complete history', async () => {
    const context = { marker: 'document-context' };
    const calls: string[] = [];
    const node = defineNode<unknown, unknown, typeof context>({
      name: 'record',
      execute(ctx) {
        calls.push(`${ctx.workflow.phase}:${ctx.workflow.stepIndex}`);
        expect(ctx.context).toBe(context);
        expect(Object.isFrozen(ctx.workflow.completedSteps)).toBe(true);
        expect(Object.isFrozen(ctx.workflow.completedNodes)).toBe(true);
        if (ctx.workflow.phase === 'beforeEach') {
          expect(ctx.workflow.completedSteps).toEqual([]);
          expect(ctx.workflow.completedNodes).toEqual([]);
        }
        if (ctx.workflow.phase === 'steps') {
          expect(ctx.workflow.completedSteps).toEqual([]);
          expect(ctx.workflow.completedNodes).toHaveLength(1);
        }
        if (ctx.workflow.phase === 'afterEach') {
          expect(ctx.workflow.completedSteps).toHaveLength(1);
          expect(ctx.workflow.completedNodes).toHaveLength(2);
        }
      },
    });
    const registry = new NodeRegistry([node]);

    const result = await runWorkflow(collected([step(node.name)]), {
      beforeEach: [step(node.name)],
      afterEach: [step(node.name)],
      resolveNode: registry.require.bind(registry),
      context,
      createRunId: () => 'run-id',
    });

    expect(calls).toEqual(['beforeEach:0', 'steps:0', 'afterEach:0']);
    expect(result).toMatchObject({
      runId: 'run-id',
      status: 'success',
      beforeEach: [{ phase: 'beforeEach', stepIndex: 0 }],
      steps: [{ phase: 'steps', stepIndex: 0 }],
      afterEach: [{ phase: 'afterEach', stepIndex: 0 }],
    });
  });

  it('skips steps after any beforeEach failure but finishes that list and runs afterEach', async () => {
    const calls: string[] = [];
    const registry = new NodeRegistry([
      defineNode({
        name: 'before.fail',
        execute() {
          calls.push('before.fail');
          throw new Error('not ready');
        },
      }),
      defineNode({
        name: 'before.next',
        execute() {
          calls.push('before.next');
        },
      }),
      defineNode({
        name: 'body',
        execute() {
          calls.push('body');
        },
      }),
      defineNode({
        name: 'after',
        execute() {
          calls.push('after');
        },
      }),
    ]);

    const result = await runWorkflow(collected([step('body')]), {
      beforeEach: [step('before.fail', true), step('before.next')],
      afterEach: [step('after')],
      resolveNode: registry.require.bind(registry),
    });

    expect(calls).toEqual(['before.fail', 'before.next', 'after']);
    expect(result.status).toBe('failed');
    expect(result.beforeEach).toHaveLength(2);
    expect(result.steps).toEqual([]);
    expect(result.afterEach).toHaveLength(1);
  });

  it('runs afterEach after a workflow step fails and preserves both errors', async () => {
    const registry = new NodeRegistry([
      defineNode({
        name: 'body.fail',
        execute() {
          throw new Error('body failed');
        },
      }),
      defineNode({
        name: 'after.fail',
        execute() {
          throw new Error('after failed');
        },
      }),
    ]);

    const result = await runWorkflow(collected([step('body.fail')]), {
      afterEach: [step('after.fail')],
      resolveNode: registry.require.bind(registry),
    });

    expect(result.status).toBe('failed');
    expect(result.steps[0].error?.message).toContain('body failed');
    expect(result.afterEach[0].error?.message).toContain('after failed');
  });

  it('applies continue-on-error only within each phase', async () => {
    const next = vi.fn();
    const registry = new NodeRegistry([
      defineNode({
        name: 'fails',
        execute() {
          throw new Error('boom');
        },
      }),
      defineNode({ name: 'next', execute: next }),
    ]);

    const result = await runWorkflow(
      collected([step('fails', true), step('next')]),
      { resolveNode: registry.require.bind(registry) },
    );

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(2);
    expect(next).toHaveBeenCalledOnce();
  });

  it('resolves every phase before running side effects and persists the result last', async () => {
    const execute = vi.fn();
    const onResult = vi.fn();
    const registry = new NodeRegistry([defineNode({ name: 'known', execute })]);

    await expect(
      runWorkflow(collected([step('known')]), {
        beforeEach: [step('known')],
        afterEach: [step('missing')],
        resolveNode: registry.require.bind(registry),
        onResult,
      }),
    ).rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
    expect(execute).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();

    const result = await runWorkflow(collected([step('known')]), {
      resolveNode: registry.require.bind(registry),
      onResult,
    });
    expect(onResult).toHaveBeenCalledWith(result);
  });
});
