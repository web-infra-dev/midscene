import type { TestRunReportSourceIndex } from '@/test-run-report';
import { type RunReportInput, buildTestRunReportDump } from '@/test-runner';
import { executionRecordsToReportInput } from '@/test-runner';
import { createLegacyYamlRuntime } from '@/yaml/legacy-yaml-runtime';
import { ScriptPlayer } from '@/yaml/player';
import { getLegacyYamlPlayerState } from '@/yaml/player-state';
import { describe, expect, test } from '@rstest/core';

const index: TestRunReportSourceIndex = {
  sources: [],
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
};

async function input() {
  const outputs: Record<string, unknown> = {};
  const runtime = createLegacyYamlRuntime({
    agent: {
      dump: { executions: [] },
      evaluateJavaScript: async () => ({ password: 'raw-value', answer: 42 }),
    } as any,
    actionSpace: [],
    sourcePath: '/fixtures/legacy.yaml',
    setResult: (key, value) => {
      outputs[key ?? 'result'] = value;
    },
  });
  const execution = await runtime.runScript({
    tasks: [
      { name: 'first', flow: [{ javascript: 'first()', name: 'first' }] },
      { name: 'second', flow: [{ javascript: 'second()', name: 'second' }] },
    ],
  });
  const report: RunReportInput = {
    runId: 'root',
    status: 'success',
    startedAt: execution.document.startedAt,
    endedAt: execution.document.endedAt,
    durationMs: execution.document.durationMs,
    summary: {
      total: 2,
      passed: 2,
      failed: 0,
      notRun: 0,
      filtered: 0,
      collectionErrors: 0,
      documentFailures: 0,
      projectFailures: 0,
    },
    projects: [
      {
        projectId: 'legacy-yaml',
        name: 'legacy',
        platform: 'web',
        status: 'success',
        retry: 0,
        documents: [execution.document],
        collectionErrors: [],
        cases: execution.cases.map((outcome) => ({
          ...outcome,
          documentId: execution.document.documentId,
          documentRunId: execution.document.documentRunId,
        })),
      },
    ],
  };
  return { report, outputs };
}

describe('entry-independent report projection', () => {
  test('bounds run-level infrastructure diagnostics without mutating raw errors', async () => {
    const { report } = await input();
    const error = new Error(
      `${'publication failed '.repeat(200)}original-tail`,
    );
    const dump = buildTestRunReportDump(
      { ...report, status: 'failed', errors: [error] },
      index,
    );
    expect(dump.status).toBe('failed');
    expect(dump.diagnostics).toContainEqual(
      expect.objectContaining({
        level: 'error',
        code: 'run-infrastructure-error',
      }),
    );
    expect(JSON.stringify(dump)).not.toContain('original-tail');
    expect(error.message).toContain('original-tail');
    expect(dump.summary).toEqual(report.summary);
  });

  test('keeps artifact failures separate from successful actions in invocation projection', async () => {
    const player = new ScriptPlayer(
      { tasks: [{ name: 'task', flow: [{ javascript: 'work()' }] }] },
      async () => ({
        agent: {
          dump: { executions: [] },
          getActionSpace: async () => [],
          evaluateJavaScript: async () => 'raw result',
        } as any,
        freeFn: [],
      }),
    );
    player.output = undefined;
    await player.run();
    const record = {
      ...getLegacyYamlPlayerState(player).executionRecord!,
      status: 'failed' as const,
      publicationErrors: [new Error('record file unavailable')],
    };
    const dump = buildTestRunReportDump(
      executionRecordsToReportInput([record], { runId: 'root' }),
      index,
    );
    expect(dump.summary).toMatchObject({
      passed: 1,
      failed: 0,
      documentFailures: 1,
    });
    expect(dump.projects[0].documents[0].hostErrors).toContainEqual(
      expect.objectContaining({
        phase: 'publication',
        error: expect.objectContaining({ message: 'record file unavailable' }),
      }),
    );
    expect(dump.projects[0].documents[0].cases[0].status).toBe('success');
  });

  test('shows setup failure with not-run tasks even without a kernel result', async () => {
    const player = new ScriptPlayer(
      { tasks: [{ name: 'not started', flow: [{ aiAct: 'do work' }] }] },
      async () => {
        throw new Error('device missing');
      },
    );
    player.output = undefined;
    await player.run();
    const input = executionRecordsToReportInput(
      [getLegacyYamlPlayerState(player).executionRecord!],
      {
        runId: 'root',
      },
    );
    const dump = buildTestRunReportDump(input, index);
    expect(dump.status).toBe('failed');
    expect(dump.summary).toMatchObject({
      total: 1,
      notRun: 1,
      documentFailures: 1,
    });
    expect(
      dump.projects[0].documents[0].hostErrors?.find(
        (item) => item.phase === 'setup',
      )?.error.message,
    ).toBe('device missing');
    expect(dump.projects[0].documents[0].cases[0].status).toBe('not-run');
  });

  test('preserves whole-file retry history while summarizing the final outcome', async () => {
    const records = [];
    for (const attemptIndex of [0, 1]) {
      const player = new ScriptPlayer(
        { tasks: [{ name: 'task', flow: [{ javascript: 'work()' }] }] },
        async () => ({
          agent: {
            dump: { executions: [] },
            getActionSpace: async () => [],
            evaluateJavaScript: async () => 'ok',
          } as any,
          freeFn: [
            {
              name: 'cleanup',
              fn: () => {
                if (attemptIndex === 0) throw new Error('cleanup failed');
              },
            },
          ],
        }),
        undefined,
        '/fixtures/retry.yaml',
      );
      player.output = undefined;
      try {
        await player.run();
      } catch (error) {
        expect((error as Error).message).toBe('cleanup failed');
      }
      // The file-retry host owns attempt identity, not the public player API.
      records.push({
        ...getLegacyYamlPlayerState(player).executionRecord!,
        attemptIndex,
      });
    }
    records.forEach((record, attemptIndex) => {
      const step = record.execution!.cases[0].run!.steps[0];
      record.execution!.document.beforeAll = [
        { ...step, phase: 'beforeAll', node: `setup-${attemptIndex}` },
      ];
    });
    const input = executionRecordsToReportInput(records, { runId: 'root' });
    const dump = buildTestRunReportDump(input, index);
    expect(dump.status).toBe('success');
    expect(dump.summary).toMatchObject({
      total: 1,
      passed: 1,
      documentFailures: 0,
    });
    const [document] = dump.projects[0].documents;
    expect(dump.projects[0].documents).toHaveLength(1);
    expect(document.attempts?.map((attempt) => attempt.attemptIndex)).toEqual([
      0, 1,
    ]);
    expect(
      document.attempts?.[0].hostErrors?.find(
        (item) => item.phase === 'cleanup',
      )?.error.message,
    ).toBe('cleanup failed');
    expect(document.hostErrors).toBeUndefined();
    expect(
      document.cases[0].attempts.map((attempt) => attempt.attemptIndex),
    ).toEqual([0, 1]);
    expect(document.cases).toHaveLength(1);
    expect(
      document.attempts?.map((attempt) => attempt.beforeAll[0].node),
    ).toEqual(['setup-0', 'setup-1']);
    expect(records[0].execution?.document.status).toBe('success');
  });

  test('uses execution identities even when legacy tasks share one Agent', async () => {
    const { report, outputs } = await input();
    const dump = buildTestRunReportDump(report, index);
    const steps = dump.projects[0].documents[0].cases.map(
      (item) => item.attempts[0].steps[0],
    );
    expect(new Set(steps.map((step) => step.id)).size).toBe(2);
    expect(steps[0].title).toBe('first()');
    expect(steps[0].output?.data?.value).toEqual({
      password: '[REDACTED]',
      answer: 42,
    });
    expect(outputs.first).toEqual({ password: 'raw-value', answer: 42 });
    expect(report.projects[0].cases[0].run?.steps[0].output?.data).toEqual(
      outputs.first,
    );
  });

  test('retains multiple whole-file attempts instead of overwriting by documentId', async () => {
    const first = (await input()).report;
    const second = (await input()).report;
    const project = first.projects[0];
    const repeated: RunReportInput = {
      ...first,
      projects: [
        {
          ...project,
          documents: [...project.documents, ...second.projects[0].documents],
          cases: [...project.cases, ...second.projects[0].cases],
        },
      ],
    };
    const dump = buildTestRunReportDump(repeated, index);
    const documents = dump.projects[0].documents;
    expect(documents).toHaveLength(2);
    expect(new Set(documents.map((item) => item.documentId)).size).toBe(2);
    expect(documents[0].logicalDocumentId).toBe(documents[1].logicalDocumentId);
    const caseKeys = documents.flatMap((document) =>
      document.cases.map((item) => `${document.documentId}:${item.caseId}`),
    );
    expect(caseKeys).toHaveLength(4);
    expect(new Set(caseKeys).size).toBe(4);
    const ambiguous = {
      ...repeated,
      projects: [
        {
          ...repeated.projects[0],
          cases: project.cases.map(({ documentRunId: _, ...item }) => item),
        },
      ],
    };
    expect(() => buildTestRunReportDump(ambiguous, index)).toThrow(
      'documentRunId',
    );
  });
});
