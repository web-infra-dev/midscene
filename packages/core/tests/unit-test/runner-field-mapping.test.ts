import { commonAgentTestRunnerNodeDefinitions } from '@/agent/test-runner-nodes';
import {
  type CollectedWorkflowDocument,
  NodeExecutionError,
  type NormalizedStep,
  defineNode,
  normalizeStep,
  runWorkflowDocument,
} from '@/test-runner';
import { describe, expect, test } from '@rstest/core';

const step = (node: string, resultName?: string): NormalizedStep => ({
  node,
  input: {},
  meta: {
    continueOnError: false,
    ...(resultName === undefined ? {} : { resultName }),
  },
});
const document = (): CollectedWorkflowDocument => ({
  documentId: 'document',
  projectId: 'project',
  sourcePath: 'flow.yaml',
  lifecycle: { beforeAll: [], beforeEach: [], afterEach: [], afterAll: [] },
  cases: [],
});
const addCase = (
  input: CollectedWorkflowDocument,
  name: string,
  steps: NormalizedStep[],
  onFailure?: 'continue' | 'stop-document',
) => {
  input.cases = [
    ...input.cases,
    {
      caseId: name,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      caseIndex: input.cases.length,
      definition: { name, steps, ...(onFailure ? { onFailure } : {}) },
    },
  ];
};

describe('shared workflow field semantics', () => {
  test('stops only the document after a stop-document Case and still runs cleanup', async () => {
    const input = document();
    addCase(input, 'allowed', [step('fail'), step('skipped')]);
    addCase(input, 'stop', [step('fail')], 'stop-document');
    addCase(input, 'later', [step('skipped')]);
    input.lifecycle.afterAll = [step('cleanup')];
    const calls: string[] = [];
    const result = await runWorkflowDocument(input, {
      resolveNode: (name) =>
        defineNode({
          name,
          execute() {
            calls.push(name);
            if (name === 'fail') throw new Error('business failure');
          },
        }),
    });
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'failed',
      'not-run',
    ]);
    expect(calls).toEqual(['fail', 'fail', 'cleanup']);
  });

  test('applies stop-document after retries are exhausted', async () => {
    const input = document();
    addCase(input, 'retry', [step('flaky')], 'stop-document');
    addCase(input, 'later', [step('later')]);
    const result = await runWorkflowDocument(input, {
      retry: 1,
      resolveNode: (name) =>
        defineNode({
          name,
          execute(ctx) {
            if (
              name === 'flaky' &&
              ctx.scope === 'case' &&
              ctx.case.attemptIndex === 0
            )
              throw new Error('try again');
          },
        }),
    });
    expect(result.cases.map(({ status }) => status)).toEqual([
      'success',
      'success',
    ]);
    expect(result.cases[0].attempts).toHaveLength(2);
  });

  test('keeps data per Step across lifecycle and retry attempts without named aggregation', async () => {
    const input = document();
    input.lifecycle.beforeAll = [step('phase')];
    input.lifecycle.beforeEach = [step('phase')];
    input.lifecycle.afterEach = [step('phase')];
    input.lifecycle.afterAll = [step('phase')];
    addCase(input, 'retry', [step('value'), step('flaky')]);
    let observed: unknown;
    const result = await runWorkflowDocument(input, {
      retry: 1,
      onDocumentResult: (result) => {
        observed = result.afterAll[0].output?.data;
      },
      resolveNode: (name) =>
        defineNode<unknown, unknown>({
          name,
          execute(ctx) {
            if (name === 'phase')
              return {
                data: {
                  value:
                    ctx.scope === 'case' ? ctx.case.phase : ctx.document.phase,
                },
              };
            if (name === 'value')
              return {
                data: {
                  'a/b': {
                    '~key': [ctx.scope === 'case' ? ctx.case.attemptIndex : -1],
                  },
                },
              };
            if (ctx.scope === 'case' && ctx.case.attemptIndex === 0)
              throw new NodeExecutionError(name, new Error('retry'), {
                data: { reason: 'temporary' },
              });
          },
        }),
    });
    expect(result.document).not.toHaveProperty('outputs');
    expect(observed).toEqual({ value: 'afterAll' });
    expect(result.cases[0].attempts?.[0].steps[0].output?.data).toEqual({
      'a/b': { '~key': [0] },
    });
    expect(result.cases[0].attempts?.[1].steps[0].output?.data).toEqual({
      'a/b': { '~key': [1] },
    });
    expect(result.cases[0].attempts?.[0].steps[1].output?.data).toEqual({
      reason: 'temporary',
    });
  });

  test('keeps a failed raw assertion on its Step, without a document result namespace', async () => {
    const input = document();
    addCase(input, 'assertion', [
      {
        ...step('aiAssert', 'check'),
        input: { prompt: 'ready', options: { keepRawResponse: true } },
      },
    ]);
    const definition = commonAgentTestRunnerNodeDefinitions.find(
      ({ name }) => name === 'aiAssert',
    )!;
    const result = await runWorkflowDocument(input, {
      resolveNode: () =>
        defineNode({
          name: definition.name,
          inputSchema: definition.inputSchema,
          execute: (ctx) =>
            definition.execute(
              { aiAssert: async () => ({ pass: false, thought: 'not ready' }) },
              ctx.input,
              { signal: ctx.signal },
            ),
        }),
    });
    expect(result.cases[0].status).toBe('failed');
    expect(result.cases[0].run?.steps[0].output?.data).toEqual({
      pass: false,
      thought: 'not ready',
    });
    expect(result.document).not.toHaveProperty('outputs');
  });

  test('retains raw error output until publication', async () => {
    const input = document();
    addCase(input, 'invalid', [step('invalid', 'bad')]);
    const result = await runWorkflowDocument(input, {
      resolveNode: () =>
        defineNode({
          name: 'invalid',
          execute() {
            throw new NodeExecutionError('invalid', new Error('failed'), {
              data: { nested: undefined },
            });
          },
        }),
    });
    expect(result.cases[0].run?.steps[0].error?.message).toContain('failed');
    expect(result.cases[0].run?.steps[0].output).toEqual({
      data: { nested: undefined },
    });
    expect(result.document).not.toHaveProperty('outputs');
  });

  test('result observer failure preserves action success and prevents business retries', async () => {
    const input = document();
    addCase(input, 'invalid selection', [step('extract'), step('later')]);
    const calls: string[] = [];
    const failure = await runWorkflowDocument(input, {
      retry: 2,
      onStepResult: () => {
        throw new Error('result observer failed');
      },
      resolveNode: (name) =>
        defineNode({
          name,
          execute() {
            calls.push(name);
            return { data: { present: 1 } };
          },
        }),
    }).catch((error) => error);
    expect(failure.code).toBe('WORKFLOW_EXECUTION_FAILURE');
    expect(calls).toEqual(['extract']);
    expect(failure.result.cases[0].run.steps[0].status).toBe('success');
    expect(failure.result.document).not.toHaveProperty('outputs');
  });

  test.each([
    { resultName: '' },
    { resultName: 3 },
    { resultName: 'valid-legacy-name' },
    { resultPath: '/value' },
    { resultName: 'name', resultPath: 'value' },
    { resultName: 'name', resultPath: '/~2' },
  ])('rejects all native named-result metadata %j', (meta) => {
    expect(() => normalizeStep({ node: { $: meta } })).toThrow();
  });
});
