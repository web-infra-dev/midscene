import { describe, expect, it, vi } from 'vitest';
import {
  type CollectedWorkflowDocument,
  DocumentNodeRegistry,
  WorkflowLifecycleError,
  createDocumentRuntime,
  defineDocumentNode,
  defineNode,
  runCase,
  runWorkflowDocument,
} from '../src';

const step = (node: string, continueOnError = false) => ({
  node,
  input: {},
  meta: { continueOnError },
});

const collectedDocument = (
  lifecycle: Partial<CollectedWorkflowDocument['lifecycle']> = {},
): CollectedWorkflowDocument => ({
  documentId: 'document-id',
  projectId: 'project-id',
  sourcePath: 'flows/example.yaml',
  lifecycle: {
    beforeAll: [],
    beforeEach: [],
    afterEach: [],
    afterAll: [],
    ...lifecycle,
  },
  cases: [
    {
      caseId: 'test-id',
      projectId: 'project-id',
      sourcePath: 'flows/example.yaml',
      caseIndex: 0,
      definition: { name: 'example', steps: [] },
    },
  ],
});

describe('workflow document runtime', () => {
  it('runs one document lifecycle and its cases as a unit', async () => {
    const calls: string[] = [];
    let stopped = false;
    const documentNode = defineDocumentNode({
      name: 'document.record',
      execute(ctx) {
        calls.push(ctx.document.phase);
      },
    });
    const caseNode = defineNode({
      name: 'case.record',
      execute(ctx) {
        calls.push(`${ctx.case.name}:${ctx.case.phase}`);
        stopped = true;
      },
    });
    const document = collectedDocument({
      beforeAll: [step(documentNode.name)],
      afterAll: [step(documentNode.name)],
    });
    document.cases[0].definition.steps = [step(caseNode.name)];
    document.cases = [
      ...document.cases,
      {
        caseId: 'second-case-id',
        projectId: 'project-id',
        sourcePath: 'flows/example.yaml',
        caseIndex: 1,
        definition: { name: 'second', steps: [step(caseNode.name)] },
      },
    ];

    const result = await runWorkflowDocument(document, {
      resolveNode: () => caseNode,
      resolveDocumentNode: () => documentNode,
      setupDocument({ onTeardown }) {
        calls.push('setupDocument');
        onTeardown(() => calls.push('documentTeardown'));
      },
      shouldStop: () => stopped,
      createCaseRunId: ({ caseId }) => `${caseId}-run`,
      createDocumentRunId: () => 'document-run',
    });

    expect(calls).toEqual([
      'setupDocument',
      'beforeAll',
      'example:steps',
      'afterAll',
      'documentTeardown',
    ]);
    expect(result.document).toMatchObject({
      documentRunId: 'document-run',
      status: 'success',
    });
    expect(result.cases).toEqual([
      expect.objectContaining({
        caseId: 'test-id',
        status: 'success',
        run: expect.objectContaining({ runId: 'test-id-run' }),
      }),
      expect.objectContaining({
        caseId: 'second-case-id',
        status: 'not-run',
        notRunReason: 'interrupted',
      }),
    ]);
  });

  it('shares one setup context with document hooks and case runs', async () => {
    const calls: string[] = [];
    const context = { marker: 'shared' };
    const documentNode = defineDocumentNode<unknown, unknown, typeof context>({
      name: 'document.record',
      execute(ctx) {
        expect(ctx.context).toBe(context);
        expect(ctx.document.documentRunId).toBe('document-run');
        expect(Object.isFrozen(ctx.document.completedNodes)).toBe(true);
        calls.push(ctx.document.phase);
      },
    });
    const caseNode = defineNode<unknown, unknown, typeof context>({
      name: 'case.record',
      execute(ctx) {
        expect(ctx.context).toBe(context);
        calls.push(ctx.case.phase);
      },
    });
    const document = collectedDocument({
      beforeAll: [step(documentNode.name)],
      beforeEach: [step(caseNode.name)],
      afterEach: [step(caseNode.name)],
      afterAll: [step(documentNode.name)],
    });
    document.cases[0].definition.steps = [step(caseNode.name)];
    const registry = new DocumentNodeRegistry([documentNode]);
    const runtime = createDocumentRuntime(document, {
      resolveNode: registry.require.bind(registry),
      setupDocument(setup) {
        expect(setup).toMatchObject({
          documentId: 'document-id',
          documentRunId: 'document-run',
          projectId: 'project-id',
          sourcePath: 'flows/example.yaml',
        });
        expect(setup.cases).toHaveLength(1);
        expect(Object.isFrozen(setup.env)).toBe(true);
        calls.push('setupDocument');
        setup.onTeardown(() => calls.push('documentTeardown'));
        return context;
      },
      createDocumentRunId: () => 'document-run',
    });

    expect((await runtime.start()).status).toBe('success');
    const attempt = await runCase(document.cases[0], {
      beforeEach: document.lifecycle.beforeEach,
      afterEach: document.lifecycle.afterEach,
      context: runtime.context,
      resolveNode: () => caseNode,
    });
    expect(attempt.status).toBe('success');
    expect((await runtime.finish()).status).toBe('success');
    expect(calls).toEqual([
      'setupDocument',
      'beforeAll',
      'beforeEach',
      'steps',
      'afterEach',
      'afterAll',
      'documentTeardown',
    ]);
  });

  it('shares one setup context across concurrent case runs', async () => {
    const context = { id: 'shared-concurrent-context' };
    const setupDocument = vi.fn(() => context);
    const seen: unknown[] = [];
    const node = defineNode<unknown, unknown, typeof context>({
      name: 'read.context',
      async execute(ctx) {
        await Promise.resolve();
        seen.push(ctx.context);
      },
    });
    const document = collectedDocument();
    document.cases[0].definition.steps = [step(node.name)];
    const runtime = createDocumentRuntime(document, {
      resolveNode: () => {
        throw new Error('no document nodes');
      },
      setupDocument,
    });

    await runtime.start();
    await Promise.all(
      ['attempt-a', 'attempt-b'].map((runId) =>
        runCase(document.cases[0], {
          context: runtime.context,
          resolveNode: () => node,
          createRunId: () => runId,
        }),
      ),
    );
    await runtime.finish();

    expect(setupDocument).toHaveBeenCalledOnce();
    expect(seen).toEqual([context, context]);
  });

  it('tears down partial setup and skips all YAML hooks after setup fails', async () => {
    const hook = vi.fn();
    const teardown = vi.fn();
    const node = defineDocumentNode({ name: 'hook', execute: hook });
    const registry = new DocumentNodeRegistry([node]);
    const runtime = createDocumentRuntime(
      collectedDocument({
        beforeAll: [step('hook')],
        afterAll: [step('hook')],
      }),
      {
        resolveNode: registry.require.bind(registry),
        setupDocument({ onTeardown }) {
          onTeardown(teardown);
          throw new Error('database unavailable');
        },
      },
    );

    expect((await runtime.start()).setupError).toMatchObject({
      code: 'WORKFLOW_DOCUMENT_SETUP_ERROR',
      message: expect.stringContaining('database unavailable'),
    });
    const result = await runtime.finish();
    expect(hook).not.toHaveBeenCalled();
    expect(teardown).toHaveBeenCalledOnce();
    expect(result.status).toBe('failed');
    expect(runtime.canRunCases).toBe(false);
  });

  it('runs afterAll and teardown after beforeAll fails', async () => {
    const calls: string[] = [];
    const registry = new DocumentNodeRegistry([
      defineDocumentNode({
        name: 'before.fail',
        execute() {
          calls.push('beforeAll');
          throw new Error('prepare failed');
        },
      }),
      defineDocumentNode({
        name: 'after',
        execute() {
          calls.push('afterAll');
        },
      }),
    ]);
    const runtime = createDocumentRuntime(
      collectedDocument({
        beforeAll: [step('before.fail')],
        afterAll: [step('after')],
      }),
      {
        resolveNode: registry.require.bind(registry),
        setupDocument({ onTeardown }) {
          onTeardown(() => calls.push('teardown'));
          return undefined;
        },
      },
    );

    expect((await runtime.start()).status).toBe('failed');
    expect(runtime.canRunCases).toBe(false);
    const result = await runtime.finish();
    expect(calls).toEqual(['beforeAll', 'afterAll', 'teardown']);
    expect(result.beforeAll[0].error?.message).toContain('prepare failed');
  });

  it('continues reverse teardown after afterAll and teardown failures', async () => {
    const calls: string[] = [];
    const node = defineDocumentNode({
      name: 'after.fail',
      execute() {
        calls.push('afterAll');
        throw new Error('after failed');
      },
    });
    const registry = new DocumentNodeRegistry([node]);
    const onResult = vi.fn(() => calls.push('result'));
    const runtime = createDocumentRuntime(
      collectedDocument({ afterAll: [step(node.name)] }),
      {
        resolveNode: registry.require.bind(registry),
        setupDocument({ onTeardown }) {
          onTeardown(() => {
            calls.push('teardown:first');
            throw new Error('first failed');
          });
          onTeardown(() => {
            calls.push('teardown:second');
            throw new Error('second failed');
          });
          return undefined;
        },
        onResult,
      },
    );

    await runtime.start();
    const result = await runtime.finish();
    expect(calls).toEqual([
      'afterAll',
      'teardown:second',
      'teardown:first',
      'result',
    ]);
    expect(result.afterAll[0].error?.message).toContain('after failed');
    expect(result.teardownErrors).toHaveLength(2);
    expect(result.teardownErrors?.map((error) => error.details)).toEqual([
      {
        documentId: 'document-id',
        documentRunId: expect.any(String),
        registrationIndex: 1,
      },
      {
        documentId: 'document-id',
        documentRunId: expect.any(String),
        registrationIndex: 0,
      },
    ]);
    expect(onResult).toHaveBeenCalledWith(result);
  });

  it('rejects teardown registration outside setupDocument', async () => {
    let lateRegistration: (() => void) | undefined;
    const runtime = createDocumentRuntime(collectedDocument(), {
      resolveNode: () => {
        throw new Error('no nodes');
      },
      setupDocument({ onTeardown }) {
        lateRegistration = () => onTeardown(() => {});
        return undefined;
      },
    });

    await runtime.start();
    expect(lateRegistration).toBeDefined();
    expect(lateRegistration).toThrow(WorkflowLifecycleError);
    await runtime.finish();
  });
});
