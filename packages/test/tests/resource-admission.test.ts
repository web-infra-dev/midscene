import { describe, expect, it, vi } from 'vitest';
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

describe('resource admission scheduling', () => {
  it('blocks the occupied Agent, runs independent work and permits authored cleanup', async () => {
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
    const result = await runCollectedCase(
      collected([
        step('pending', 10),
        step('blocked'),
        { node: 'plain', input: {} as any, meta: { continueOnError: true } },
        step('independent'),
      ]),
      {
        resolveNode: registry.require.bind(registry),
        createRunId: () => 'attempt',
        afterEach: [step('cleanup')],
      },
    );
    expect(result.steps.map((item) => item.status)).toEqual([
      'failed',
      'not-run',
      'success',
      'success',
    ]);
    expect(result.steps[1]).toMatchObject({
      blockedBy: 'attempt:steps:0',
      error: { code: 'RESOURCE_OPERATION_PENDING' },
    });
    expect(result.steps[1].startedAt).toBeUndefined();
    expect(result.steps[1].durationMs).toBeUndefined();
    expect(first.action.mock.calls.map(([prompt]) => prompt)).toEqual([
      'pending',
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
    const blocked = dump.projects[0].documents[0].cases[0].attempts[0].steps[1];
    expect(blocked).toMatchObject({
      status: 'not-run',
      blockedBy: 'attempt:steps:0',
    });
    expect(blocked.agentDetailDiagnostic).toBeUndefined();
    // Only the two actions actually attempted on the first Agent and the independent action need references.
    expect(
      dump.diagnostics?.filter(
        (item) => item.code === 'agent-detail-unavailable',
      ),
    ).toHaveLength(3);
  });

  it('does not assume that a cancelled operation settling has restored business state', async () => {
    const pending = gate();
    const agent = {
      action: vi.fn(async (prompt: string) => {
        if (prompt === 'pending') await pending.promise;
      }),
      _createReportSource: snapshot,
    };
    const registry = new NodeRegistry([
      ...createMidsceneNodes({ getAgent: () => agent as any, agentClass }),
      defineNode({
        name: 'settle',
        execute: async () => {
          pending.resolve();
          await pending.promise;
          await Promise.resolve();
        },
      }),
    ]);
    const result = await runCollectedCase(
      collected([
        step('pending', 10),
        { node: 'settle', input: {} as any, meta: { continueOnError: true } },
        step('unrecovered'),
      ]),
      {
        resolveNode: registry.require.bind(registry),
        afterEach: [step('cleanup')],
      },
    );
    expect(result.steps[2]).toMatchObject({
      status: 'not-run',
      error: { code: 'RESOURCE_RECOVERY_REQUIRED' },
    });
    expect(agent.action.mock.calls.map(([prompt]) => prompt)).toEqual([
      'pending',
      'cleanup',
    ]);
    expect(result.afterEach[0].status).toBe('success');
  });

  it('stops the phase when the blocked step does not allow continuation', async () => {
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
    const blocked = step('blocked');
    blocked.meta.continueOnError = false;
    const result = await runCollectedCase(
      collected([step('pending', 10), blocked, step('not-dispatched')]),
      {
        resolveNode: registry.require.bind(registry),
        afterEach: [step('cleanup')],
      },
    );
    expect(result.steps.map((item) => item.status)).toEqual([
      'failed',
      'not-run',
    ]);
    expect(agent.action.mock.calls.map(([prompt]) => prompt)).toEqual([
      'pending',
      'cleanup',
    ]);
  });
});
