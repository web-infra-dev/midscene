import { describe, expect, it, vi } from 'vitest';
import { NodeRegistry, createDocumentRuntime } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { type MidsceneUIAgent, createMidsceneNodes } from '../src/midscene';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
} from '../src/parser/types';

const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'midscene-test',
  projectId: 'project',
  sourcePath: 'flows/midscene.yaml',
  caseIndex: 0,
  definition: { name: 'midscene case', steps },
});

describe('createMidsceneNodes', () => {
  it('maps case inputs to one Agent from setup context', async () => {
    const aiAct = vi.fn(async () => 'action completed');
    const aiAssert = vi.fn(async () => undefined);
    const recordToReport = vi.fn(async () => undefined);
    const agent: MidsceneUIAgent = { aiAct, aiAssert, recordToReport };
    const getAgent = vi.fn(
      ({ context }: { context: { uiAgent: MidsceneUIAgent } }) =>
        context.uiAgent,
    );
    const nodes = createMidsceneNodes({ getAgent });
    const registry = new NodeRegistry(nodes);

    const result = await runCollectedCase(
      collected([
        {
          node: 'aiAct',
          input: { prompt: 'Create an order', options: { deepThink: true } },
          meta: { continueOnError: false },
        },
        {
          node: 'aiAssert',
          input: {
            prompt: 'The order is paid',
            message: 'Paid state is missing',
            options: { domIncluded: false },
          },
          meta: { continueOnError: false },
        },
        {
          node: 'recordToReport',
          input: { title: 'Order created', content: 'order-1' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        context: { uiAgent: agent },
      },
    );

    expect(registry.names()).toEqual(['aiAct', 'aiAssert', 'recordToReport']);
    expect(getAgent).toHaveBeenCalledTimes(3);
    expect(aiAct).toHaveBeenCalledWith('Create an order', {
      deepThink: true,
      abortSignal: expect.any(AbortSignal),
    });
    expect(aiAssert).toHaveBeenCalledWith(
      'The order is paid',
      'Paid state is missing',
      { domIncluded: false, abortSignal: expect.any(AbortSignal) },
    );
    expect(recordToReport).toHaveBeenCalledWith('Order created', {
      content: 'order-1',
    });
    expect(result.steps.map((step) => step.output?.summary)).toEqual([
      'action completed',
      'Assertion passed: The order is paid',
      'Recorded to report: Order created',
    ]);
  });

  it('supports recordToReport string shorthand without an AI call', async () => {
    const recordToReport = vi.fn(async () => undefined);
    const agent = { recordToReport } as unknown as MidsceneUIAgent;
    const nodes = createMidsceneNodes<{ agent: MidsceneUIAgent }>({
      getAgent: ({ context }) => context.agent,
    });
    const registry = new NodeRegistry(nodes);

    const result = await runCollectedCase(
      collected([
        {
          node: 'recordToReport',
          input: { prompt: 'Checkpoint' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        context: { agent },
      },
    );

    expect(result.status).toBe('success');
    expect(recordToReport).toHaveBeenCalledWith('Checkpoint', {});
  });

  it('rejects invalid node input and missing Agent methods clearly', async () => {
    const nodes = createMidsceneNodes<{ agent: MidsceneUIAgent }>({
      getAgent: ({ context }) => context.agent,
    });
    const registry = new NodeRegistry(nodes);
    const run = (
      node: string,
      input: Record<string, unknown>,
      agent: MidsceneUIAgent,
    ) =>
      runCollectedCase(
        collected([{ node, input, meta: { continueOnError: false } }]),
        {
          resolveNode: registry.require.bind(registry),
          context: { agent },
        },
      );

    const invalidOptions = await run(
      'aiAssert',
      {
        prompt: 'Visible',
        options: { keepRawResponse: true },
      },
      {
        aiAssert: vi.fn(async () => undefined),
      } as unknown as MidsceneUIAgent,
    );
    expect(invalidOptions.steps[0].error).toMatchObject({
      code: 'NODE_EXECUTION_ERROR',
      message: expect.stringContaining('unsupported option "keepRawResponse"'),
    });

    const missingMethod = await run(
      'aiAct',
      { prompt: 'Click submit' },
      {} as MidsceneUIAgent,
    );
    expect(missingMethod.steps[0].error).toMatchObject({
      code: 'NODE_EXECUTION_ERROR',
      message: expect.stringContaining('Agent with aiAct()'),
    });
  });

  it('validates factory options during static node registration', () => {
    expect(() => createMidsceneNodes({} as never)).toThrow(
      'createMidsceneNodes() requires a getAgent function.',
    );
  });

  it('runs the same Midscene nodes in document scope', async () => {
    const recordToReport = vi.fn(async () => undefined);
    const agent = { recordToReport } as unknown as MidsceneUIAgent;
    const nodes = createMidsceneNodes<{
      agent: MidsceneUIAgent;
    }>({
      getAgent(ctx) {
        if (ctx.scope !== 'document')
          throw new Error('document scope required');
        expect(ctx.document.phase).toBe('beforeAll');
        expect('case' in ctx).toBe(false);
        return ctx.context.agent;
      },
    });
    const registry = new NodeRegistry(nodes);
    const document: CollectedWorkflowDocument = {
      documentId: 'document',
      projectId: 'project',
      sourcePath: 'report.yaml',
      lifecycle: {
        beforeAll: [
          {
            node: 'recordToReport',
            input: { prompt: 'Document started' },
            meta: { continueOnError: false },
          },
        ],
        beforeEach: [],
        afterEach: [],
        afterAll: [],
      },
      cases: [collected([])],
    };
    const runtime = createDocumentRuntime(document, {
      resolveNode: registry.require.bind(registry),
      setupDocument: () => ({ agent }),
    });

    const result = await runtime.start();
    expect(result.beforeAll[0]).toMatchObject({
      phase: 'beforeAll',
      output: { summary: 'Recorded to report: Document started' },
    });
    expect(recordToReport).toHaveBeenCalledWith('Document started', {});
    await runtime.finish();
  });
});
