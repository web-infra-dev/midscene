import {
  type WorkflowDocumentExecutionResult,
  WorkflowExecutionFailure,
  buildTestRunReportDump,
  defineNode,
  runCollectedCase,
  runWorkflowDocument,
} from '@/test-runner';
import { ScriptPlayer } from '@/yaml/player';
import { collectLegacyYamlDocument } from '@/yaml/test-runner-compat';
import { describe, expect, test } from '@rstest/core';

const document = () =>
  collectLegacyYamlDocument({
    tasks: [
      { name: 'first', flow: [{ javascript: 'first()' }] },
      { name: 'second', flow: [{ javascript: 'second()' }] },
    ],
  });

const resolveNode = () =>
  defineNode({
    name: 'javascript',
    execute(ctx) {
      ctx.onTeardown(() => {
        throw new Error('cleanup failed');
      });
      return { data: 42 };
    },
  });

describe('execution facts survive infrastructure failures', () => {
  test('retains readable error messages after worker JSON transport', () => {
    const error = {
      name: 'WorkflowPublicationError',
      message: 'result file unavailable',
      code: 'WORKFLOW_PUBLICATION_FAILED',
    };
    const result = { completed: true };
    const failure = new WorkflowExecutionFailure(result, [error]);
    expect(failure.message).toBe('result file unavailable');
    expect(failure.result).toBe(result);
    expect(failure.errors[0]).toBe(error);
  });
  test('retains a completed Step and cleanup errors when its callback throws', async () => {
    const failure = await runCollectedCase(document().cases[0], {
      resolveNode,
      onStepResult() {
        throw new Error('callback failed');
      },
    }).catch((error) => error);
    expect(failure).toBeInstanceOf(WorkflowExecutionFailure);
    expect(failure.result).toMatchObject({
      status: 'failed',
      steps: [{ status: 'success', output: { data: 42 } }],
      executionErrors: [{ message: 'callback failed' }],
      teardownErrors: [{ message: expect.stringContaining('cleanup failed') }],
    });
  });

  test('does not replay completed actions after a teardown failure', async () => {
    const input = document();
    input.cases = input.cases.slice(0, 1);
    let actions = 0;
    let cleanups = 0;
    const cleanupError = new Error('report flush failed');
    const node = defineNode({
      name: 'javascript',
      execute(ctx) {
        actions++;
        ctx.onTeardown(async () => {
          if (++cleanups === 1) throw cleanupError;
        });
        return { data: 42 };
      },
    });
    const result = await runWorkflowDocument(input, {
      resolveNode: () => node,
      retry: 1,
    });
    expect(actions).toBe(1);
    expect(cleanups).toBe(1);
    expect(result.cases[0].attempts).toHaveLength(1);
    expect(result.cases[0]).toMatchObject({
      status: 'failed',
      run: {
        steps: [{ status: 'success', output: { data: 42 } }],
        teardownErrors: [{ cause: cleanupError }],
      },
    });
  });

  test.each(['beforeEach', 'steps', 'afterEach'] as const)(
    'still retries a business failure in %s',
    async (phase) => {
      const input = document();
      input.cases = input.cases.slice(0, 1);
      const step = input.cases[0].definition.steps[0];
      if (phase !== 'steps') input.lifecycle[phase] = [step];
      let failures = 0;
      const node = defineNode({
        name: 'javascript',
        execute(ctx) {
          if (ctx.scope === 'case' && ctx.case.phase === phase) {
            if (++failures === 1)
              throw new Error('temporary assertion failure');
          }
          return { data: 42 };
        },
      });
      const result = await runWorkflowDocument(input, {
        resolveNode: () => node,
        retry: 1,
      });
      expect(failures).toBe(2);
      expect(result.cases[0].attempts).toHaveLength(2);
      expect(result.cases[0].attempts?.map((run) => run.status)).toEqual([
        'failed',
        'success',
      ]);
      expect(result.cases[0].status).toBe('success');
    },
  );

  test('retains the failed Case, stops retrying infrastructure failures and marks remaining Cases not-run', async () => {
    let calls = 0;
    const failure = await runWorkflowDocument(document(), {
      resolveNode,
      retry: 3,
      onCaseResult() {
        calls++;
        throw new Error('result persistence failed');
      },
    }).catch((error) => error);
    expect(calls).toBe(1);
    expect(failure).toBeInstanceOf(WorkflowExecutionFailure);
    const partial = failure.result as WorkflowDocumentExecutionResult;
    expect(partial.document.status).toBe('failed');
    expect(partial.cases[0].attempts).toHaveLength(1);
    expect(partial.cases[0].run?.steps[0].output?.data).toBe(42);
    expect(partial.cases[1]).toMatchObject({
      status: 'not-run',
      notRunReason: 'interrupted',
    });
    const dump = buildTestRunReportDump(
      {
        runId: 'run',
        status: 'failed',
        startedAt: partial.document.startedAt,
        endedAt: partial.document.endedAt,
        durationMs: partial.document.durationMs,
        summary: {
          total: 2,
          passed: 0,
          failed: 1,
          notRun: 1,
          filtered: 0,
          collectionErrors: 0,
          documentFailures: 1,
          projectFailures: 0,
        },
        projects: [
          {
            projectId: 'legacy-yaml',
            name: 'legacy-yaml',
            platform: 'web',
            status: 'failed',
            retry: 3,
            documents: [partial.document],
            cases: partial.cases.map((item) => ({
              ...item,
              documentId: partial.document.documentId,
            })),
            collectionErrors: [],
          },
        ],
      },
      {
        sources: [],
        metrics: {
          modelCallCount: 0,
          modelTimeMs: 0,
          promptTokens: 0,
          cachedInputTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      },
    );
    expect(
      dump.projects[0].documents[0].cases[0].attempts[0].hostErrors?.[0],
    ).toMatchObject({
      phase: 'execution',
      error: { message: 'result persistence failed' },
    });
  });

  test('retains both document callback errors and runs cleanup', async () => {
    const input = document();
    const step = input.cases[0].definition.steps[0];
    input.lifecycle.beforeAll = [step];
    input.lifecycle.afterAll = [step];
    const failure = await runWorkflowDocument(input, {
      resolveNode,
      onStepResult(info) {
        throw new Error(
          `${info.scope === 'document' ? info.document.phase : 'case'} callback`,
        );
      },
    }).catch((error) => error);
    expect(failure.result.document).toMatchObject({
      status: 'failed',
      beforeAll: [{ status: 'success' }],
      afterAll: [{ status: 'success' }],
      executionErrors: [
        { message: 'beforeAll callback' },
        { message: 'afterAll callback' },
      ],
    });
    expect(failure.result.document.teardownErrors).toHaveLength(2);
    expect(
      failure.result.cases.every(
        (item: { status: string }) => item.status === 'not-run',
      ),
    ).toBe(true);
  });

  test('ScriptPlayer publishes partial records and still rejects callback errors', async () => {
    const player = new ScriptPlayer(
      { tasks: [{ name: 'first', flow: [{ javascript: '42' }] }] },
      async () => ({
        agent: {
          getActionSpace: async () => [],
          evaluateJavaScript: async () => 42,
        } as any,
        freeFn: [],
      }),
      (task) => {
        if (task.status === 'done') throw new Error('legacy callback failed');
      },
    );
    player.output = undefined;
    await expect(player.run()).rejects.toThrow('legacy callback failed');
    expect(player.executionRecord).toMatchObject({
      status: 'failed',
      execution: { cases: [{ run: { steps: [{ status: 'success' }] } }] },
    });
  });
});
