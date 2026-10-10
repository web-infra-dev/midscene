import { describe, expect, it, vi } from 'vitest';
import { NodeRegistry, createDocumentRuntime } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createMidsceneNodes } from '../src/midscene';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
} from '../src/parser/types';

const step = (prompt: string, timeoutMs?: number) => ({
  node: 'action',
  input: { prompt },
  meta: { continueOnError: false, timeoutMs },
});
const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'case',
  projectId: 'project',
  sourcePath: 'case.yaml',
  caseIndex: 0,
  definition: { name: 'case', steps },
});
const agentClass = {
  getTestRunnerNodeDefinitions: () => [
    {
      name: 'action',
      execute: (agent: any, input: any) => agent.action(input.prompt),
    },
  ],
};
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

describe('independent Agent report snapshots', () => {
  it('keeps usage independently of failed detail storage and freezes it at publication', async () => {
    let listener: ((dump: string, execution: any) => void) | undefined;
    const usage = { total_tokens: 42, time_cost: 125 };
    const agent = {
      action: async () =>
        listener?.('{}', {
          id: 'execution',
          tasks: [{ type: 'Insight', status: 'failed', usage }],
        }),
      addDumpUpdateListener(callback: typeof listener) {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
      _createReportSource: async () => {
        throw new Error('snapshot storage unavailable');
      },
    };
    const registry = new NodeRegistry(
      createMidsceneNodes({ getAgent: () => agent as any, agentClass }),
    );
    const result = await runCollectedCase(collected([step('done')]), {
      resolveNode: registry.require.bind(registry),
    });
    expect(result.steps[0].status).toBe('success');
    expect(result.steps[0].report?.collectionErrors?.[0].message).toContain(
      'snapshot storage unavailable',
    );
    const metrics = result.steps[0].report?.traces[0].metrics;
    expect(metrics).toMatchObject({
      modelCallCount: 1,
      modelTimeMs: 125,
      totalTokens: 42,
      collection: { status: 'complete' },
    });
    usage.total_tokens = 1000;
    expect(metrics?.totalTokens).toBe(42);
    expect(listener).toBeUndefined();
  });

  it('preserves external HTML-only providers at the collection boundary and marks them partial', async () => {
    const agent = {
      action: vi.fn(),
      flushReport: vi.fn(async () => '/tmp/external.html'),
    };
    const registry = new NodeRegistry(
      createMidsceneNodes({ getAgent: () => agent as any, agentClass }),
    );
    const result = await runCollectedCase(collected([step('done')]), {
      resolveNode: registry.require.bind(registry),
    });
    expect(result.status).toBe('success');
    expect(agent.flushReport).toHaveBeenCalledTimes(1);
    expect(result.reportSources).toEqual([
      expect.objectContaining({
        sourcePath: '/tmp/external.html',
        collection: expect.objectContaining({
          status: 'partial',
          reason: expect.stringContaining('live HTML'),
        }),
      }),
    ]);
  });
  it.each(['case', 'document'] as const)(
    'keeps completed and partial evidence when %s cleanup is deferred',
    async (scope) => {
      const pending = gate();
      const released = gate();
      const listeners = new Set<
        (dump: string, execution: { id: string }) => void
      >();
      const executionIds: string[] = [];
      let snapshotIndex = 0;
      const agent = {
        action: vi.fn(async (prompt: string) => {
          executionIds.push(prompt);
          for (const listener of listeners) listener('{}', { id: prompt });
          if (prompt === 'pending') await pending.promise;
        }),
        addDumpUpdateListener(
          listener: (dump: string, execution: { id: string }) => void,
        ) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        _createReportSource: vi.fn(async () => ({
          sourcePath: '/tmp/agent.html',
          dumpPath: `/tmp/snapshot-${++snapshotIndex}.json`,
          collection: {
            status: 'complete' as const,
            capturedAt: '2026-10-08T00:00:00.000Z',
          },
        })),
      };
      const releaseAgent = vi.fn(async () => {
        released.resolve();
      });
      const registry = new NodeRegistry(
        createMidsceneNodes({
          agentProvider: { getAgent: () => agent as any, releaseAgent },
          agentClass,
        }),
      );
      const steps = [step('completed'), step('pending', 10)];
      let result;
      if (scope === 'case')
        result = await runCollectedCase(collected(steps), {
          resolveNode: registry.require.bind(registry),
        });
      else {
        const document: CollectedWorkflowDocument = {
          documentId: 'document',
          projectId: 'project',
          sourcePath: 'case.yaml',
          lifecycle: {
            beforeAll: steps,
            beforeEach: [],
            afterEach: [],
            afterAll: [],
          },
          cases: [],
        };
        const runtime = createDocumentRuntime(document, {
          resolveNode: registry.require.bind(registry),
        });
        await runtime.start();
        result = await runtime.finish();
      }
      const actual = 'steps' in result ? result.steps : result.beforeAll;
      expect(actual.map((value) => value.status)).toEqual([
        'success',
        'failed',
      ]);
      expect(actual[0].report?.sources?.[0].collection?.status).toBe(
        'complete',
      );
      expect(actual[1].report?.sources?.[0].collection?.status).toBe('partial');
      expect(actual[1].report?.traces[0].executionId).toBe('pending');
      expect(agent._createReportSource).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        ['completed'],
      );
      expect(agent._createReportSource).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        ['pending'],
      );
      expect(result.reportSources).toEqual([
        expect.objectContaining({
          dumpPath: '/tmp/snapshot-1.json',
          collection: expect.objectContaining({ status: 'complete' }),
        }),
        expect.objectContaining({
          dumpPath: '/tmp/snapshot-2.json',
          collection: expect.objectContaining({ status: 'partial' }),
        }),
      ]);
      expect(result.cleanup?.status).toBe('pending');
      expect(result.teardownErrors).toBeUndefined();
      expect(releaseAgent).not.toHaveBeenCalled();
      expect(executionIds).toEqual(['completed', 'pending']);
      const published = JSON.stringify(result);
      pending.resolve();
      await released.promise;
      expect(JSON.stringify(result)).toBe(published);
    },
  );

  it('preserves the snapshot when release fails', async () => {
    const agent = {
      action: vi.fn(),
      _createReportSource: vi.fn(async () => ({
        sourcePath: '/tmp/agent.html',
        dumpPath: '/tmp/source.json',
      })),
    };
    const registry = new NodeRegistry(
      createMidsceneNodes({
        agentProvider: {
          getAgent: () => agent as any,
          releaseAgent: async () => {
            throw new Error('dispose failed');
          },
        },
        agentClass,
      }),
    );
    const result = await runCollectedCase(collected([step('done')]), {
      resolveNode: registry.require.bind(registry),
    });
    expect(result.steps[0].status).toBe('success');
    expect(result.reportSources?.[0].dumpPath).toBe('/tmp/source.json');
    expect(result.teardownErrors?.[0].message).toContain('dispose failed');
  });

  it('does not turn collection failure into an action failure and retains the last good snapshot', async () => {
    const agent = {
      action: vi.fn(),
      _createReportSource: vi
        .fn()
        .mockResolvedValueOnce({
          sourcePath: '/tmp/agent.html',
          dumpPath: '/tmp/good.json',
        })
        .mockRejectedValueOnce(new Error('disk full')),
    };
    const releaseAgent = vi.fn(async () => {});
    const registry = new NodeRegistry(
      createMidsceneNodes({
        agentProvider: { getAgent: () => agent as any, releaseAgent },
        agentClass,
      }),
    );
    const result = await runCollectedCase(
      collected([step('first'), step('second')]),
      { resolveNode: registry.require.bind(registry) },
    );
    expect(result.status).toBe('success');
    expect(result.steps[1].report?.collectionErrors?.[0].message).toContain(
      'disk full',
    );
    expect(result.reportSources?.[0].dumpPath).toBe('/tmp/good.json');
    expect(agent.action).toHaveBeenCalledTimes(2);
    expect(releaseAgent).toHaveBeenCalledTimes(1);
  });
});
