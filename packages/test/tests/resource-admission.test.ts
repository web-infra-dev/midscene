import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { NodeRegistry, defineNode } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createMidsceneNodes } from '../src/midscene';
import type { CollectedCase } from '../src/parser/types';
import { buildTestRunReportDump } from '../src/report/test-run-report';

const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const step = (prompt: string, timeoutMs?: number) => ({
  node: 'aiAct',
  input: { prompt },
  meta: { continueOnError: true, timeoutMs },
});
const actionInputSchema = z.strictObject({ prompt: z.string() });
const agentClass = {
  getTestRunnerNodeDefinitions: () => [
    {
      name: 'aiAct',
      inputSchema: actionInputSchema,
      execute: (agent: any, input: any) => agent.action(input.prompt),
    },
  ],
};
const collected = (steps: CollectedCase['definition']['steps']) => ({
  caseId: 'case',
  projectId: 'project',
  sourcePath: 'case.yaml',
  caseIndex: 0,
  definition: { name: 'case', steps },
});
const snapshot = async () => ({
  sourcePath: '/tmp/agent.html',
  dumpPath: '/tmp/agent.json',
});
afterEach(() => vi.useRealTimers());

describe('resource admission scheduling', () => {
  it('waits for the occupied Agent before continuing the authored steps', async () => {
    vi.useFakeTimers();
    const pending = gate();
    const first = {
      action: vi.fn(async (prompt: string) => {
        if (prompt === 'pending') await pending.promise;
        if (prompt === 'cleanup') pending.resolve();
      }),
      _createReportSource: snapshot,
    };
    const independent = { action: vi.fn(), _createReportSource: snapshot };
    const plain = vi.fn();
    const registry = new NodeRegistry([
      ...createMidsceneNodes({
        getAgent: (ctx) =>
          actionInputSchema.parse(ctx.input).prompt === 'independent'
            ? (independent as any)
            : (first as any),
        agentClass,
      }),
      defineNode({ name: 'plain', execute: plain }),
    ]);
    const running = runCollectedCase(
      collected([
        step('pending', 10),
        step('resumed'),
        { node: 'plain', input: {} as any, meta: { continueOnError: true } },
        step('independent'),
      ]),
      {
        resolveNode: registry.require.bind(registry),
        createRunId: () => 'attempt',
        afterEach: [step('cleanup')],
      },
    );
    await vi.advanceTimersByTimeAsync(110);
    expect(first.action.mock.calls.map(([prompt]) => prompt)).toEqual([
      'pending',
    ]);
    expect(plain).not.toHaveBeenCalled();
    pending.resolve();
    const result = await running;
    expect(result.steps.map((item) => item.status)).toEqual([
      'failed',
      'success',
      'success',
      'success',
    ]);
    expect(result.steps[1].waitForPreviousOperationMs).toBeGreaterThanOrEqual(
      100,
    );
    expect(first.action.mock.calls.map(([prompt]) => prompt)).toEqual([
      'pending',
      'resumed',
      'cleanup',
    ]);
    expect(independent.action).toHaveBeenCalledTimes(1);
    expect(plain).toHaveBeenCalledTimes(1);
    expect(result.afterEach[0].status).toBe('success');
    expect(result.teardownErrors).toBeUndefined();

    const dump = buildTestRunReportDump(
      {
        runId: 'run',
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        durationMs: result.durationMs,
        status: 'failed',
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          notRun: 0,
          filtered: 0,
          collectionErrors: 0,
          documentFailures: 0,
          projectFailures: 0,
        },
        projects: [
          {
            projectId: 'project',
            name: 'project',
            status: 'failed',
            retry: 0,
            documents: [],
            collectionErrors: [],
            cases: [
              {
                caseId: 'case',
                name: 'case',
                caseIndex: 0,
                sourcePath: 'case.yaml',
                projectName: 'project',
                documentId: 'document',
                status: 'failed',
                run: result,
              },
            ],
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
    const resumed = dump.projects[0].documents[0].cases[0].attempts[0].steps[1];
    expect(resumed).toMatchObject({
      status: 'success',
      waitForPreviousOperationMs: result.steps[1].waitForPreviousOperationMs,
    });
    // Every dispatched Agent action has its own evidence reference.
    expect(
      dump.diagnostics?.filter(
        (item) => item.code === 'agent-detail-unavailable',
      ),
    ).toHaveLength(4);
  });

  it('does not overlap cleanup with a timed-out Agent action', async () => {
    vi.useFakeTimers();
    const pending = gate();
    const agent = {
      action: vi.fn(async (prompt: string) => {
        if (prompt === 'pending') await pending.promise;
        if (prompt === 'cleanup') pending.resolve();
      }),
      _createReportSource: snapshot,
    };
    const registry = new NodeRegistry(
      createMidsceneNodes({ getAgent: () => agent as any, agentClass }),
    );
    const timedOut = step('pending', 10);
    timedOut.meta.continueOnError = false;
    const running = runCollectedCase(
      collected([timedOut, step('not-dispatched')]),
      {
        resolveNode: registry.require.bind(registry),
        afterEach: [step('cleanup')],
      },
    );
    await vi.advanceTimersByTimeAsync(1100);
    const result = await running;
    expect(result.steps.map((item) => item.status)).toEqual(['failed']);
    expect(agent.action.mock.calls.map(([prompt]) => prompt)).toEqual([
      'pending',
    ]);
    expect(result.afterEach[0]).toMatchObject({
      status: 'not-run',
      error: { code: 'RESOURCE_OPERATION_PENDING' },
      blockedBy: `${result.runId}:steps:0`,
    });
    expect(result.cleanup?.status).toBe('pending');
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
  });
});
