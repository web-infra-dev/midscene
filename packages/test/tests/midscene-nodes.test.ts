import { resolve } from 'node:path';
import { commonAgentTestRunnerNodeDefinitions } from '@midscene/core/agent/test-runner';
import { describe, expect, it, vi } from 'vitest';
import { NodeRegistry, createDocumentRuntime, defineNode } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import {
  type MidsceneUIAgent,
  createMidsceneNodes,
  renderNodeHistory,
} from '../src/midscene';
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

const commonAgent = (
  overrides: Partial<MidsceneUIAgent> = {},
): MidsceneUIAgent => ({
  aiAct: vi.fn(async () => undefined),
  aiTap: vi.fn(async () => undefined),
  aiAssert: vi.fn(async () => undefined),
  aiBoolean: vi.fn(async () => false),
  aiNumber: vi.fn(async () => 0),
  aiString: vi.fn(async () => ''),
  aiAsk: vi.fn(async () => ''),
  recordToReport: vi.fn(async () => undefined),
  ...overrides,
});

const testAgentClass = {
  getTestRunnerNodeDefinitions: () => commonAgentTestRunnerNodeDefinitions,
};

describe('createMidsceneNodes', () => {
  it('maps case inputs to one Agent from setup context', async () => {
    const aiAct = vi.fn(async () => 'action completed');
    const aiAssert = vi.fn(async () => undefined);
    const recordToReport = vi.fn(async () => undefined);
    const agent = commonAgent({ aiAct, aiAssert, recordToReport });
    const getAgent = vi.fn(
      ({ context }: { context: { uiAgent: MidsceneUIAgent } }) =>
        context.uiAgent,
    );
    const nodes = createMidsceneNodes({
      getAgent,
      agentClass: testAgentClass,
    });
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
          input: {
            title: 'Order created',
            options: { content: 'order-1' },
          },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        context: { uiAgent: agent },
      },
    );

    expect(registry.names()).toEqual([
      'aiAct',
      'aiTap',
      'aiAssert',
      'aiBoolean',
      'aiNumber',
      'aiString',
      'aiAsk',
      'recordToReport',
      'wait',
      'agent',
    ]);
    expect(getAgent).toHaveBeenCalledTimes(3);
    expect(aiAct).toHaveBeenCalledWith('Create an order', {
      deepThink: true,
      context: undefined,
      abortSignal: expect.any(AbortSignal),
    });
    expect(aiAssert).toHaveBeenCalledWith(
      'The order is paid',
      'Paid state is missing',
      {
        domIncluded: false,
        context: expect.stringContaining('Previous workflow results'),
        abortSignal: expect.any(AbortSignal),
      },
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

  it('uses the canonical recordToReport input without an AI call', async () => {
    const recordToReport = vi.fn(async () => undefined);
    const agent = { recordToReport } as unknown as MidsceneUIAgent;
    const nodes = createMidsceneNodes<{ agent: MidsceneUIAgent }>({
      getAgent: ({ context }) => context.agent,
      agentClass: testAgentClass,
    });
    const registry = new NodeRegistry(nodes);

    const result = await runCollectedCase(
      collected([
        {
          node: 'recordToReport',
          input: { title: 'Checkpoint' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        context: { agent },
      },
    );

    expect(result.status).toBe('success');
    expect(recordToReport).toHaveBeenCalledWith('Checkpoint', undefined);
  });

  it('forwards reference images to aiAct and aiAssert as multimodal prompts', async () => {
    const aiAct = vi.fn(async () => 'opened editor');
    const aiAssert = vi.fn(async () => undefined);
    const agent = { aiAct, aiAssert } as unknown as MidsceneUIAgent;
    const registry = new NodeRegistry(
      createMidsceneNodes<{ agent: MidsceneUIAgent }>({
        getAgent: ({ context }) => context.agent,
        agentClass: testAgentClass,
      }),
    );
    const capsule = {
      name: '音乐胶囊',
      url: 'https://example.com/capsule.png',
    };
    const editor = {
      name: '全屏音乐编辑器',
      url: 'https://example.com/editor.jpg',
    };

    const result = await runCollectedCase(
      collected([
        {
          node: 'aiAct',
          input: {
            prompt: {
              prompt: '点击音乐胶囊进入编辑器',
              images: [capsule, editor],
              convertHttpImage2Base64: true,
            },
          },
          meta: { continueOnError: false },
        },
        {
          node: 'aiAssert',
          input: {
            prompt: {
              prompt: '当前页面与全屏音乐编辑器参考图一致',
              images: [editor],
              convertHttpImage2Base64: true,
            },
            options: { screenshotIncluded: true },
          },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        context: { agent },
      },
    );

    expect(result.status).toBe('success');
    expect(aiAct).toHaveBeenCalledWith(
      {
        prompt: '点击音乐胶囊进入编辑器',
        images: [capsule, editor],
        convertHttpImage2Base64: true,
      },
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    expect(aiAssert).toHaveBeenCalledWith(
      {
        prompt: '当前页面与全屏音乐编辑器参考图一致',
        images: [editor],
        convertHttpImage2Base64: true,
      },
      undefined,
      expect.objectContaining({
        screenshotIncluded: true,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('forwards common Agent method options and preserves insight values', async () => {
    const aiTap = vi.fn(async () => undefined);
    const aiBoolean = vi.fn(async () => true);
    const aiNumber = vi.fn(async () => 42);
    const aiString = vi.fn(async () => 'ready');
    const aiAsk = vi.fn(async () => 'details');
    const aiAssert = vi.fn(async () => ({ pass: true }));
    const registry = new NodeRegistry(
      createMidsceneNodes({
        getAgent: () =>
          commonAgent({
            aiTap,
            aiBoolean,
            aiNumber,
            aiString,
            aiAsk,
            aiAssert,
          }),
        agentClass: testAgentClass,
      }),
    );
    const result = await runCollectedCase(
      collected([
        {
          node: 'aiTap',
          input: { prompt: 'Submit', options: { deepLocate: true } },
          meta: { continueOnError: false },
        },
        ...(['aiBoolean', 'aiNumber', 'aiString', 'aiAsk'] as const).map(
          (node) => ({
            node,
            input: { prompt: `Read with ${node}` },
            meta: { continueOnError: false },
          }),
        ),
        {
          node: 'aiAssert',
          input: {
            prompt: 'The result is visible',
            options: { keepRawResponse: true },
          },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry) },
    );

    expect(result.status).toBe('success');
    expect(aiTap).toHaveBeenCalledWith(
      'Submit',
      expect.objectContaining({ deepLocate: true }),
    );
    expect(result.steps.slice(1, 5).map((step) => step.output?.data)).toEqual([
      { value: true },
      { value: 42 },
      { value: 'ready' },
      { value: 'details' },
    ]);
    expect(aiAssert).toHaveBeenCalledWith(
      'The result is visible',
      undefined,
      expect.objectContaining({
        keepRawResponse: true,
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(result.steps[5].output?.data).toEqual({ pass: true });
  });

  it('bounds Agent history context without changing the complete Node result', async () => {
    const stdout = 'x'.repeat(100_000);
    const aiAssert = vi.fn(async () => undefined);
    const registry = new NodeRegistry([
      defineNode({
        name: 'large-output',
        execute() {
          return { data: { stdout } };
        },
      }),
      ...createMidsceneNodes({
        getAgent: () => commonAgent({ aiAssert }),
        agentClass: testAgentClass,
      }),
    ]);

    const result = await runCollectedCase(
      collected([
        {
          node: 'large-output',
          input: {},
          meta: { continueOnError: false },
        },
        {
          node: 'aiAssert',
          input: { prompt: 'The command completed.' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry) },
    );

    expect(result.steps[0].output?.data).toEqual({ stdout });
    const agentContext = aiAssert.mock.calls[0][2]?.context;
    expect(agentContext).toBeDefined();
    expect(agentContext!.length).toBeLessThanOrEqual(64_000);
    expect(agentContext).toContain('omittedFromContext');
    expect(agentContext).not.toContain(stdout);
  });

  it('prioritizes recent entries when total Agent history is too large', () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      scope: 'case' as const,
      phase: 'steps' as const,
      stepIndex: index,
      node: `output-${index + 1}`,
      status: 'passed' as const,
      data: { stdout: String(index + 1).repeat(9_000) },
    }));

    const rendered = renderNodeHistory(history);

    expect(rendered).toBeDefined();
    expect(rendered!.length).toBeLessThanOrEqual(64_000);
    expect(rendered).toContain('earlier history entries were omitted');
    expect(rendered).toContain('"node":"output-12"');
    expect(rendered).not.toContain('"node":"output-1","status"');
  });

  it('rejects invalid node input and missing Agent methods clearly', async () => {
    const nodes = createMidsceneNodes<{ agent: MidsceneUIAgent }>({
      getAgent: ({ context }) => context.agent,
      agentClass: testAgentClass,
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
        options: { abortSignal: true },
      },
      commonAgent(),
    );
    expect(invalidOptions.steps[0].error).toMatchObject({
      code: 'NODE_INPUT_VALIDATION_ERROR',
      message: expect.stringContaining('input validation failed'),
      details: { node: 'aiAssert' },
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
      'createMidsceneNodes() requires getAgent or agentProvider.getAgent.',
    );
    expect(() =>
      createMidsceneNodes({ getAgent: () => commonAgent() } as never),
    ).toThrow(
      'createMidsceneNodes() requires agentClass.getTestRunnerNodeDefinitions().',
    );
    expect(() =>
      createMidsceneNodes({
        getAgent: () => commonAgent(),
        agentClass: {},
      } as never),
    ).toThrow(
      'createMidsceneNodes() requires agentClass.getTestRunnerNodeDefinitions().',
    );
  });

  it('releases an AgentProvider scope exactly once after each case attempt', async () => {
    const agent = commonAgent({
      aiAct: vi.fn(async () => 'acted'),
      aiAssert: vi.fn(async () => undefined),
      recordToReport: vi.fn(async () => undefined),
    });
    const getAgent = vi.fn(async (_runId: string) => agent);
    const releaseAgent = vi.fn(async (runId: string) => ({
      reportPath: resolve(`/tmp/${runId}.html`),
    }));
    const registry = new NodeRegistry(
      createMidsceneNodes({
        agentProvider: { getAgent, releaseAgent },
        agentClass: testAgentClass,
      }),
    );

    for (const runId of ['attempt-1', 'attempt-2']) {
      const result = await runCollectedCase(
        collected([
          {
            node: 'aiAct',
            input: { prompt: 'Open checkout' },
            meta: { continueOnError: false },
          },
          {
            node: 'aiAssert',
            input: { prompt: 'Checkout is visible' },
            meta: { continueOnError: false },
          },
        ]),
        {
          resolveNode: registry.require.bind(registry),
          createRunId: () => runId,
        },
      );
      expect(result.status).toBe('success');
      expect(result.reportPaths).toEqual([resolve(`/tmp/${runId}.html`)]);
    }

    expect(getAgent).toHaveBeenCalledTimes(4);
    expect(getAgent.mock.calls.map(([runId]) => runId)).toEqual([
      'attempt-1',
      'attempt-1',
      'attempt-2',
      'attempt-2',
    ]);
    expect(releaseAgent.mock.calls).toEqual([['attempt-1'], ['attempt-2']]);
  });

  it('delegates agent nodes and provides history to the executor', async () => {
    const agentExecutor = {
      execute: vi.fn(async () => ({ summary: 'agent completed' })),
    };
    const registry = new NodeRegistry(
      createMidsceneNodes({
        getAgent: () => commonAgent(),
        agentClass: testAgentClass,
        agentExecutor,
      }),
    );

    const result = await runCollectedCase(
      collected([
        {
          node: 'wait',
          input: { duration: 1, unit: 'ms' },
          meta: { continueOnError: false },
        },
        {
          node: 'agent',
          input: { prompt: 'Inspect the current page with the allowed tools.' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        context: { platform: 'ios' },
        createRunId: () => 'agent-attempt',
      },
    );

    expect(result.status).toBe('success');
    expect(agentExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Inspect the current page with the allowed tools.',
        context: { platform: 'ios' },
        execution: { scope: 'case', runId: 'agent-attempt' },
        history: [expect.objectContaining({ node: 'wait', status: 'passed' })],
      }),
    );
  });

  it('aborts a wait node through the active workflow signal', async () => {
    const registry = new NodeRegistry(
      createMidsceneNodes({
        getAgent: () => ({}) as MidsceneUIAgent,
        agentClass: testAgentClass,
      }),
    );
    const controller = new AbortController();
    const pending = runCollectedCase(
      collected([
        {
          node: 'wait',
          input: { duration: 10, unit: 's' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        signal: controller.signal,
      },
    );
    setTimeout(() => controller.abort(new Error('test interrupted')), 5);

    const result = await pending;
    expect(result).toMatchObject({
      status: 'failed',
      steps: [
        {
          status: 'failed',
          error: { message: expect.stringContaining('test interrupted') },
        },
      ],
    });
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
      agentClass: testAgentClass,
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
            input: { title: 'Document started' },
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
      projectContext: { agent },
    });

    const result = await runtime.start();
    expect(result.beforeAll[0]).toMatchObject({
      phase: 'beforeAll',
      output: { summary: 'Recorded to report: Document started' },
    });
    expect(recordToReport).toHaveBeenCalledWith('Document started', undefined);
    await runtime.finish();
  });

  it('does not register platform lifecycle nodes in the common preset', () => {
    const nodes = createMidsceneNodes({
      getAgent: () => commonAgent(),
      agentClass: testAgentClass,
    });

    expect(nodes.map((node) => node.name)).not.toContain('launch');
    expect(nodes.map((node) => node.name)).not.toContain('terminate');
  });
});
