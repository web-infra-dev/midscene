import type { MidsceneYamlScript } from '@/types';
import {
  createLegacyYamlRuntime,
  legacyYamlOutcomeError,
} from '@/yaml/legacy-yaml-runtime';
import { describe, expect, rstest as rs, test } from '@rstest/core';

describe('legacy YAML runtime', () => {
  test.each([false, true])(
    'owns task continuation without a facade: %s',
    async (continueOnError) => {
      const evaluateJavaScript = rs
        .fn()
        .mockRejectedValueOnce(new Error('first failed'))
        .mockResolvedValueOnce('next');
      const runtime = createLegacyYamlRuntime({
        agent: { evaluateJavaScript, dump: { executions: [] } } as any,
        actionSpace: [],
        setResult: () => {},
      });
      const onCaseOutcome = rs.fn();
      const execution = await runtime.runScript(
        {
          tasks: [
            {
              name: 'first',
              continueOnError,
              flow: [{ javascript: 'first()' }],
            },
            { name: 'second', flow: [{ javascript: 'second()' }] },
          ],
        },
        { onCaseOutcome },
      );
      expect(execution.cases.map((item) => item.status)).toEqual([
        'failed',
        continueOnError ? 'success' : 'not-run',
      ]);
      expect(onCaseOutcome).toHaveBeenCalledTimes(2);
    },
  );

  test('quarantines a timed-out Agent and discards late outputs and traces', async () => {
    let finish!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const listeners = new Set<
      (dump: string, execution: { id: string }) => void
    >();
    const setResult = rs.fn();
    const agent = {
      dump: { executions: [] },
      evaluateJavaScript: rs.fn().mockImplementation(async () => {
        const value = await pending;
        for (const listener of listeners) listener('', { id: 'late' });
        return value;
      }),
      addDumpUpdateListener: (
        listener: (dump: string, execution: { id: string }) => void,
      ) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const runtime = createLegacyYamlRuntime({
      agent: agent as any,
      actionSpace: [],
      setResult,
    });
    const script: MidsceneYamlScript = {
      tasks: [{ name: 'slow', flow: [{ javascript: 'slow()' }] }],
    };
    const execution = await runtime.runScript(script, { defaultTimeoutMs: 10 });
    expect(execution.cases[0].run?.steps[0].error?.code).toBe('STEP_TIMEOUT');
    expect(listeners.size).toBe(0);
    const reused = await createLegacyYamlRuntime({
      agent: agent as any,
      actionSpace: [],
      setResult,
    }).runScript(script);
    expect(legacyYamlOutcomeError(reused.cases[0]).message).toContain(
      'Cannot reuse an Agent',
    );
    expect(agent.evaluateJavaScript).toHaveBeenCalledTimes(1);
    finish('late output');
    await runtime.waitForIdle();
    expect(setResult).not.toHaveBeenCalled();
    expect((await runtime.runScript(script)).cases[0].status).toBe('success');
  });

  test('forwards cancellation to cooperative actions and stops following tasks', async () => {
    const controller = new AbortController();
    const aiAct = rs.fn().mockImplementation(async (_prompt, options) => {
      expect(options.abortSignal).toBeInstanceOf(AbortSignal);
      controller.abort(new Error('cancelled'));
      options.abortSignal.throwIfAborted();
    });
    const runtime = createLegacyYamlRuntime({
      agent: { aiAct, dump: { executions: [] } } as any,
      actionSpace: [],
      setResult: () => {},
    });
    const result = await runtime.runScript(
      {
        tasks: [
          {
            name: 'cancel',
            continueOnError: true,
            flow: [{ aiAct: 'cancel' }],
          },
          { name: 'skip', flow: [{ aiAct: 'skip' }] },
        ],
      },
      { signal: controller.signal },
    );
    expect(result.cases.map((item) => item.status)).toEqual([
      'failed',
      'not-run',
    ]);
    expect(result.cases[1].notRunReason).toBe('interrupted');
    expect(aiAct).toHaveBeenCalledTimes(1);
    await runtime.waitForIdle();
  });

  test('aborts sleep without waiting for its timer', async () => {
    const runtime = createLegacyYamlRuntime({
      agent: { dump: { executions: [] } } as any,
      actionSpace: [],
      setResult: () => {},
    });
    const result = await runtime.runScript(
      { tasks: [{ name: 'sleep', flow: [{ sleep: 60_000 }] }] },
      { defaultTimeoutMs: 10 },
    );
    await runtime.waitForIdle();
    expect(result.cases[0].run?.steps[0].error?.code).toBe('STEP_TIMEOUT');
  });

  test('runs a legacy script without going through the ScriptPlayer facade', async () => {
    const script = {
      tasks: [
        {
          name: 'read page state',
          flow: [{ javascript: 'return document.title', name: 'title' }],
        },
      ],
    } as MidsceneYamlScript;
    const result: Record<string, unknown> = {};
    const agent = {
      dump: { executions: [] },
      evaluateJavaScript: rs.fn().mockResolvedValue('Midscene'),
      reportFile: null,
    };
    const onCaseStart = rs.fn();
    const runtime = createLegacyYamlRuntime({
      agent: agent as any,
      actionSpace: [],
      sourcePath: '/fixtures/direct-runtime.yaml',
      setResult: (key, value) => {
        result[key ?? 'unnamed'] = value;
      },
    });

    const execution = await runtime.runScript(script, { onCaseStart });

    expect(execution.cases[0]).toMatchObject({
      name: 'read page state',
      status: 'success',
      run: {
        steps: [{ node: 'javascript', status: 'success' }],
      },
    });
    expect(result).toEqual({ title: 'Midscene' });
    expect(onCaseStart).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: '/fixtures/direct-runtime.yaml',
        caseIndex: 0,
      }),
    );
  });

  test('keeps legacy error reporting and exposes the original action error', async () => {
    const failure = new Error('javascript failed');
    const script = {
      tasks: [
        {
          name: 'broken action',
          flow: [{ javascript: 'throw new Error()' }],
        },
      ],
    } as MidsceneYamlScript;
    const recordErrorToReport = rs.fn();
    const runtime = createLegacyYamlRuntime({
      agent: {
        dump: { executions: [] },
        evaluateJavaScript: rs.fn().mockRejectedValue(failure),
        recordErrorToReport,
      } as any,
      actionSpace: [],
      setResult: () => {},
    });

    const execution = await runtime.runScript(script);
    const outcome = execution.cases[0];

    expect(outcome.status).toBe('failed');
    expect(legacyYamlOutcomeError(outcome)).toBe(failure);
    expect(recordErrorToReport).toHaveBeenCalledWith(
      'YAML task failed - broken action',
      {
        error: failure,
        content: 'Step 0 failed while running YAML task "broken action".',
      },
    );
  });
});
