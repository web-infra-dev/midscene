import {
  REPORT_SNAPSHOT_TIMEOUT_MS,
  defineNode,
  executeStep,
} from '@/test-runner';
import { afterEach, describe, expect, rs, test } from '@rstest/core';

afterEach(() => rs.useRealTimers());

describe('bounded report collection', () => {
  test('marks HTML captures partial and detaches their metadata from the provider', async () => {
    const source = {
      sourcePath: '/tmp/report.html',
      collection: {
        status: 'complete' as const,
        capturedAt: '2026-10-08T00:00:00.000Z',
      },
    };
    const node = defineNode({
      name: 'custom',
      execute(ctx) {
        ctx.report.onSnapshot(() => source);
      },
    });
    const result = await executeStep(
      { node: 'custom', input: {}, meta: { continueOnError: false } },
      node,
      {
        scope: 'case',
        case: {
          caseId: 'case',
          runId: 'attempt',
          projectName: 'project',
          attemptIndex: 0,
          name: 'case',
          sourcePath: 'case.yaml',
          caseIndex: 0,
          phase: 'steps',
          stepIndex: 0,
        },
      },
      undefined,
    );
    source.sourcePath = '/tmp/changed.html';
    source.collection.capturedAt = 'changed';
    expect(result.report?.sources?.[0]).toMatchObject({
      sourcePath: '/tmp/report.html',
      collection: { status: 'partial', capturedAt: '2026-10-08T00:00:00.000Z' },
    });
  });
  test('bounds capture independently of action success and ignores late publication', async () => {
    rs.useFakeTimers();
    let resolve!: (source: { sourcePath: string; dumpPath: string }) => void;
    const pending = new Promise<{ sourcePath: string; dumpPath: string }>(
      (yes) => {
        resolve = yes;
      },
    );
    let signal!: AbortSignal;
    const node = defineNode({
      name: 'custom',
      execute(ctx) {
        ctx.report.onSnapshot((captureSignal) => {
          signal = captureSignal;
          return pending;
        });
        return { summary: 'action succeeded' };
      },
    });
    const resultPromise = executeStep(
      { node: 'custom', input: {}, meta: { continueOnError: false } },
      node,
      {
        scope: 'case',
        case: {
          caseId: 'case',
          runId: 'attempt',
          projectName: 'project',
          attemptIndex: 0,
          name: 'case',
          sourcePath: 'case.yaml',
          caseIndex: 0,
          phase: 'steps',
          stepIndex: 0,
        },
      },
      undefined,
    );
    await rs.advanceTimersByTimeAsync(REPORT_SNAPSHOT_TIMEOUT_MS);
    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.report?.collectionErrors?.[0].code).toBe(
      'REPORT_SNAPSHOT_TIMEOUT',
    );
    expect(signal.aborted).toBe(true);
    resolve({ sourcePath: '/tmp/late.html', dumpPath: '/tmp/late.json' });
    await pending;
    expect(result.report?.sources).toBeUndefined();
  });
});
