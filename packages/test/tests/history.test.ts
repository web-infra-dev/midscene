import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src/engine/registry';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { runWorkflowDocument } from '../src/engine/run-workflow-document';
import { defineNode } from '../src/node/define-node';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  NormalizedStep,
} from '../src/parser/types';

const step = (
  node: string,
  input: Record<string, unknown>,
): NormalizedStep => ({
  node,
  input,
  meta: { continueOnError: false },
});

const collectedCase = (steps: readonly NormalizedStep[]): CollectedCase => ({
  caseId: 'case-1',
  projectId: 'project',
  sourcePath: 'flow.yaml',
  caseIndex: 0,
  definition: { name: 'history case', steps },
});

describe('node history', () => {
  it('gives every node a deeply read-only view of completed nodes in the attempt', async () => {
    const snapshots: Array<{
      label: string;
      nodes: string[];
      frozen: boolean;
    }> = [];
    const inspect = defineNode({
      name: 'inspect',
      execute(ctx) {
        snapshots.push({
          label: String(ctx.input.label),
          nodes: ctx.history.map((entry) => entry.node),
          frozen:
            Object.isFrozen(ctx.history) &&
            ctx.history.every(
              (entry) => Object.isFrozen(entry) && Object.isFrozen(entry.input),
            ),
        });
        return {
          summary: String(ctx.input.label),
          data: { label: ctx.input.label },
        };
      },
    });
    const registry = new NodeRegistry([inspect]);

    const result = await runCollectedCase(
      collectedCase([
        step('inspect', { label: 'step-1' }),
        step('inspect', { label: 'step-2' }),
      ]),
      {
        resolveNode: registry.require.bind(registry),
        beforeEach: [step('inspect', { label: 'before' })],
        afterEach: [step('inspect', { label: 'after' })],
      },
    );

    expect(result.status).toBe('success');
    expect(snapshots).toEqual([
      { label: 'before', nodes: [], frozen: true },
      { label: 'step-1', nodes: ['inspect'], frozen: true },
      { label: 'step-2', nodes: ['inspect', 'inspect'], frozen: true },
      {
        label: 'after',
        nodes: ['inspect', 'inspect', 'inspect'],
        frozen: true,
      },
    ]);
  });

  it('fails the producing node when history data is not JSON-compatible', async () => {
    const registry = new NodeRegistry([
      defineNode({
        name: 'invalid-output',
        execute() {
          return { data: { missing: undefined } };
        },
      }),
    ]);

    const result = await runCollectedCase(
      collectedCase([step('invalid-output', {})]),
      { resolveNode: registry.require.bind(registry) },
    );

    expect(result.steps[0]).toMatchObject({
      status: 'failed',
      error: {
        code: 'NODE_EXECUTION_ERROR',
        message: expect.stringContaining('contains undefined'),
      },
    });
  });

  it('deeply freezes normalized failure details', async () => {
    let frozen = false;
    const registry = new NodeRegistry([
      defineNode({
        name: 'fail',
        execute() {
          throw new Error('expected failure');
        },
      }),
      defineNode({
        name: 'inspect',
        execute(ctx) {
          frozen = Object.isFrozen(ctx.history[0].error);
        },
      }),
    ]);
    const failingStep = step('fail', {});
    failingStep.meta.continueOnError = true;

    await runCollectedCase(collectedCase([failingStep, step('inspect', {})]), {
      resolveNode: registry.require.bind(registry),
    });

    expect(frozen).toBe(true);
  });

  it('isolates retry and case history while keeping document beforeAll', async () => {
    const caseHistories: string[][] = [];
    const documentHistories: string[][] = [];
    const registry = new NodeRegistry([
      defineNode({
        name: 'document-node',
        execute(ctx) {
          documentHistories.push(ctx.history.map((entry) => entry.node));
          return { summary: ctx.document.phase };
        },
      }),
      defineNode({
        name: 'case-node',
        execute(ctx) {
          caseHistories.push(ctx.history.map((entry) => entry.node));
          if (ctx.case.attemptIndex === 0) throw new Error('retry me');
          return { summary: 'passed' };
        },
      }),
    ]);
    const document: CollectedWorkflowDocument = {
      documentId: 'document-1',
      projectId: 'project',
      sourcePath: 'flow.yaml',
      lifecycle: {
        beforeAll: [step('document-node', {})],
        beforeEach: [],
        afterEach: [],
        afterAll: [step('document-node', {})],
      },
      cases: [collectedCase([step('case-node', {})])],
    };

    const execution = await runWorkflowDocument(document, {
      resolveNode: registry.require.bind(registry),
      retry: 1,
    });

    expect(execution.cases[0].status).toBe('success');
    expect(execution.cases[0].attempts).toHaveLength(2);
    expect(caseHistories).toEqual([['document-node'], ['document-node']]);
    expect(documentHistories).toEqual([[], ['document-node']]);
  });
});
