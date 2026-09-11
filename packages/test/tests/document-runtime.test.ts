import { describe, expect, it, vi } from 'vitest';
import {
  type CollectedWorkflowDocument,
  NodeRegistry,
  createDocumentRuntime,
  defineNode,
  runWorkflowDocument,
} from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';

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
  it('rejects an invalid retry before running document lifecycle', async () => {
    await expect(
      runWorkflowDocument(collectedDocument(), {
        resolveNode: () => {
          throw new Error('no nodes');
        },
        retry: -1,
      }),
    ).rejects.toThrow('retry must be a non-negative integer');
  });

  it('runs one node definition in document and case scopes', async () => {
    const calls: string[] = [];
    const sharedNode = defineNode({
      name: 'shared.record',
      execute(execution) {
        calls.push(execution.scope);
        if (execution.scope === 'document') {
          expect('case' in execution).toBe(false);
          calls.push(execution.document.phase);
        } else {
          expect('document' in execution).toBe(false);
          calls.push(execution.case.phase);
        }
      },
    });
    const document = collectedDocument({
      beforeAll: [step(sharedNode.name)],
      afterAll: [step(sharedNode.name)],
    });
    document.cases[0].definition.steps = [step(sharedNode.name)];
    const registry = new NodeRegistry([sharedNode]);

    await runWorkflowDocument(document, {
      resolveNode: registry.require.bind(registry),
    });

    expect(calls).toEqual([
      'document',
      'beforeAll',
      'case',
      'steps',
      'document',
      'afterAll',
    ]);
  });

  it('runs one document lifecycle and its cases as a unit', async () => {
    const calls: string[] = [];
    let stopped = false;
    const documentNode = defineNode({
      name: 'document.record',
      execute(execution) {
        if (execution.scope !== 'document')
          throw new Error('document scope required');
        calls.push(execution.document.phase);
      },
    });
    const caseNode = defineNode({
      name: 'case.record',
      execute(execution) {
        if (execution.scope !== 'case') throw new Error('case scope required');
        calls.push(`${execution.case.name}:${execution.case.phase}`);
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
    const registry = new NodeRegistry([documentNode, caseNode]);

    const result = await runWorkflowDocument(document, {
      resolveNode: registry.require.bind(registry),
      shouldStop: () => stopped,
      createCaseRunId: ({ caseId }) => `${caseId}-run`,
      createDocumentRunId: () => 'document-run',
    });

    expect(calls).toEqual(['beforeAll', 'example:steps', 'afterAll']);
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

  it('shares one Project context with document hooks and case runs', async () => {
    const calls: string[] = [];
    const context = { marker: 'shared' };
    const documentNode = defineNode<unknown, unknown, typeof context>({
      name: 'document.record',
      execute(execution) {
        if (execution.scope !== 'document')
          throw new Error('document scope required');
        expect(execution.context).toBe(context);
        expect(execution.document.documentRunId).toBe('document-run');
        calls.push(execution.document.phase);
      },
    });
    const caseNode = defineNode<unknown, unknown, typeof context>({
      name: 'case.record',
      execute(execution) {
        if (execution.scope !== 'case') throw new Error('case scope required');
        expect(execution.context).toBe(context);
        calls.push(execution.case.phase);
      },
    });
    const document = collectedDocument({
      beforeAll: [step(documentNode.name)],
      beforeEach: [step(caseNode.name)],
      afterEach: [step(caseNode.name)],
      afterAll: [step(documentNode.name)],
    });
    document.cases[0].definition.steps = [step(caseNode.name)];
    const registry = new NodeRegistry([documentNode]);
    const runtime = createDocumentRuntime(document, {
      resolveNode: registry.require.bind(registry),
      projectContext: context,
      createDocumentRunId: () => 'document-run',
    });

    expect((await runtime.start()).status).toBe('success');
    const attempt = await runCollectedCase(document.cases[0], {
      beforeEach: document.lifecycle.beforeEach,
      afterEach: document.lifecycle.afterEach,
      context: runtime.context,
      resolveNode: () => caseNode,
    });
    expect(attempt.status).toBe('success');
    expect((await runtime.finish()).status).toBe('success');
    expect(calls).toEqual([
      'beforeAll',
      'beforeEach',
      'steps',
      'afterEach',
      'afterAll',
    ]);
  });

  it('shares one Project context across concurrent case runs', async () => {
    const context = { id: 'shared-concurrent-context' };
    const seen: unknown[] = [];
    const node = defineNode<unknown, unknown, typeof context>({
      name: 'read.context',
      async execute(execution) {
        await Promise.resolve();
        seen.push(execution.context);
      },
    });
    const document = collectedDocument();
    document.cases[0].definition.steps = [step(node.name)];
    const runtime = createDocumentRuntime(document, {
      resolveNode: () => {
        throw new Error('no document nodes');
      },
      projectContext: context,
    });

    await runtime.start();
    await Promise.all(
      ['attempt-a', 'attempt-b'].map((runId) =>
        runCollectedCase(document.cases[0], {
          context: runtime.context,
          resolveNode: () => node,
          createRunId: () => runId,
        }),
      ),
    );
    await runtime.finish();

    expect(seen).toEqual([context, context]);
  });

  it('runs afterAll and Node teardown after beforeAll fails', async () => {
    const calls: string[] = [];
    const registry = new NodeRegistry([
      defineNode({
        name: 'before.fail',
        execute({ onTeardown }) {
          calls.push('beforeAll');
          onTeardown(() => {
            calls.push('teardown');
          });
          throw new Error('prepare failed');
        },
      }),
      defineNode({
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
      },
    );

    expect((await runtime.start()).status).toBe('failed');
    expect(runtime.canRunCases).toBe(false);
    const result = await runtime.finish();
    expect(calls).toEqual(['beforeAll', 'afterAll', 'teardown']);
    expect(result.beforeAll[0].error?.message).toContain('prepare failed');
  });

  it('continues reverse Node teardown after afterAll and teardown failures', async () => {
    const calls: string[] = [];
    const resource = defineNode({
      name: 'resource',
      execute({ onTeardown }) {
        onTeardown(() => {
          calls.push('teardown:first');
          throw new Error('first failed');
        });
        onTeardown(() => {
          calls.push('teardown:second');
          throw new Error('second failed');
        });
      },
    });
    const after = defineNode({
      name: 'after.fail',
      execute() {
        calls.push('afterAll');
        throw new Error('after failed');
      },
    });
    const registry = new NodeRegistry([resource, after]);
    const onResult = vi.fn(() => calls.push('result'));
    const runtime = createDocumentRuntime(
      collectedDocument({
        beforeAll: [step(resource.name)],
        afterAll: [step(after.name)],
      }),
      {
        resolveNode: registry.require.bind(registry),
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
        scope: 'document',
        scopeId: expect.any(String),
        node: 'resource',
        registrationIndex: 1,
      },
      {
        scope: 'document',
        scopeId: expect.any(String),
        node: 'resource',
        registrationIndex: 0,
      },
    ]);
    expect(onResult).toHaveBeenCalledWith(result);
  });

  it('exposes Node teardown failure in the document result', async () => {
    const node = defineNode({
      name: 'resource',
      execute({ onTeardown }) {
        onTeardown(() => {
          throw new Error('agent release failed');
        });
      },
    });
    const runtime = createDocumentRuntime(
      collectedDocument({ beforeAll: [step(node.name)] }),
      {
        resolveNode: () => node,
      },
    );

    await runtime.start();
    const result = await runtime.finish();

    expect(result).toMatchObject({
      status: 'failed',
      teardownErrors: [{ code: 'NODE_SCOPE_TEARDOWN_ERROR' }],
    });
  });

  it('runs cleanup hooks with usable signals after interruption', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const abort = defineNode({
      name: 'abort.workflow',
      execute(execution) {
        calls.push(`body:${execution.signal.aborted}`);
        controller.abort(new Error('interrupted'));
      },
    });
    const cleanup = defineNode({
      name: 'cleanup.workflow',
      execute(execution) {
        const phase =
          execution.scope === 'case'
            ? execution.case.phase
            : execution.document.phase;
        calls.push(`${phase}:${execution.signal.aborted}`);
        expect(execution.signal.aborted).toBe(false);
      },
    });
    const document = collectedDocument({
      afterEach: [step(cleanup.name)],
      afterAll: [step(cleanup.name)],
    });
    document.cases[0].definition.steps = [step(abort.name)];
    const registry = new NodeRegistry([abort, cleanup]);

    const result = await runWorkflowDocument(document, {
      resolveNode: registry.require.bind(registry),
      signal: controller.signal,
    });

    expect(calls).toEqual(['body:false', 'afterEach:false', 'afterAll:false']);
    expect(result.cases[0].status).toBe('success');
    expect(result.document.status).toBe('success');
  });
});

describe('document resource ownership', () => {
  it('releases each attempt context after hooks and Node teardown without changing Project context', async () => {
    const events: string[] = [];
    const shared = { id: 0 };
    let next = 0;
    const document = collectedDocument({
      beforeAll: [step('use')],
      afterAll: [step('use')],
    });
    document.cases[0].definition.steps = [step('use')];
    const node = defineNode<unknown, unknown, { id: number }>({
      name: 'use',
      execute(ctx) {
        events.push(`${ctx.scope}:${ctx.context.id}`);
        ctx.onTeardown(() => {
          events.push(`node-release:${ctx.context.id}`);
        });
      },
    });
    const documentSetup = {
      name: 'session',
      setup(
        ctx: import('../src/cli/test-project').DocumentSetupContext<{
          id: number;
        }>,
      ) {
        expect(ctx.projectContext).toBe(shared);
        expect(ctx.document.attemptIndex).toBe(next);
        const context = { id: ++next };
        events.push(`acquire:${context.id}`);
        ctx.onTeardown(() => {
          events.push(`release:${context.id}`);
        });
        return context;
      },
    };
    for (const documentAttemptIndex of [0, 1]) {
      await runWorkflowDocument(document, {
        resolveNode: () => node,
        documentSetup,
        projectContext: shared,
        documentAttemptIndex,
      });
    }
    expect(shared.id).toBe(0);
    expect(events).toEqual(
      [1, 2].flatMap((id) => [
        `acquire:${id}`,
        `document:${id}`,
        `case:${id}`,
        `node-release:${id}`,
        `document:${id}`,
        `node-release:${id}`,
        `node-release:${id}`,
        `release:${id}`,
      ]),
    );
  });

  it('releases partially acquired resources when setup fails, skips authored hooks, and rejects late registrations', async () => {
    const release = vi.fn();
    const execute = vi.fn();
    let register: ((callback: () => void) => void) | undefined;
    const document = collectedDocument({ afterAll: [step('use')] });
    const result = await runWorkflowDocument(document, {
      resolveNode: () => ({ name: 'use', execute }),
      documentSetup: {
        name: 'partial',
        setup(ctx) {
          register = ctx.onTeardown;
          ctx.onTeardown(release);
          throw new Error('connection failed');
        },
      },
    });
    expect(result.document).toMatchObject({
      status: 'failed',
      hostErrors: [{ phase: 'setup', error: { message: 'connection failed' } }],
    });
    expect(result.cases[0]).toMatchObject({
      status: 'not-run',
      notRunReason: 'document-start-failed',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(() => register!(() => {})).toThrow('registered during setup');
  });

  it('preserves successful actions and releases every resource when owner cleanup fails', async () => {
    const events: string[] = [];
    const document = collectedDocument();
    document.cases[0].definition.steps = [step('use')];
    const failure = await runWorkflowDocument(document, {
      resolveNode: () => ({
        name: 'use',
        execute() {
          events.push('action');
        },
      }),
      documentSetup: {
        name: 'owner',
        setup(ctx) {
          ctx.onTeardown(() => {
            events.push('first');
          });
          ctx.onTeardown(() => {
            events.push('second');
            throw new Error('close failed');
          });
        },
      },
    }).catch((error) => error);
    expect(events).toEqual(['action', 'second', 'first']);
    expect(failure.result.cases[0].status).toBe('success');
    expect(failure.result.document).toMatchObject({
      status: 'failed',
      hostErrors: [{ phase: 'cleanup', error: { message: 'close failed' } }],
    });
  });
});
