import { Agent } from '@/agent';
import { commonAgentTestRunnerNodeDefinitions } from '@/agent/test-runner-nodes';
import { ScreenshotItem } from '@/screenshot-item';
import type { MidsceneYamlScript, UIContext } from '@/types';
import {
  createLegacyYamlRuntime,
  legacyYamlOutcomeError,
} from '@/yaml/legacy-yaml-runtime';
import { ScriptPlayer } from '@/yaml/player';
import { describe, expect, rstest as rs, test } from '@rstest/core';

const createUIContext = (): UIContext => ({
  screenshot: ScreenshotItem.create(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    Date.now(),
  ),
  shotSize: { width: 1, height: 1 },
  shrunkShotToLogicalRatio: 1,
  _isFrozen: true,
});

describe('legacy YAML runtime', () => {
  test.each(['aiTap', 'aiScroll', 'aiLocate'])(
    'keeps uiContext for legacy %s without exposing it on native Nodes',
    async (node) => {
      const action = rs.fn().mockResolvedValue(undefined);
      const uiContext = createUIContext();
      const runtime = createLegacyYamlRuntime({
        agent: { [node]: action, dump: { executions: [] } } as any,
        actionSpace: [],
        setResult: () => {},
      });
      const result = await runtime.runScript({
        tasks: [
          { name: 'locate', flow: [{ [node]: 'target', uiContext } as any] },
        ],
      });
      expect(result.cases[0].status).toBe('success');
      expect(action).toHaveBeenCalledWith(
        'target',
        expect.objectContaining({ uiContext }),
      );
      expect(action.mock.calls[0][1].uiContext).toBe(uiContext);
      const native = commonAgentTestRunnerNodeDefinitions.find(
        (definition) => definition.name === node,
      )!;
      expect(
        native.inputSchema.safeParse({
          prompt: 'target',
          options: { uiContext },
        }).success,
      ).toBe(false);
    },
  );

  test('passes a valid aiLocate uiContext through the public ScriptPlayer facade', async () => {
    const uiContext = createUIContext();
    const element = { center: [10, 10] };
    const aiLocate = rs.fn().mockResolvedValue(element);
    const player = new ScriptPlayer(
      {
        agent: { generateReport: false },
        tasks: [{ name: 'locate', flow: [{ aiLocate: 'button', uiContext }] }],
      },
      async () => ({
        agent: { aiLocate, getActionSpace: async () => [] } as any,
        freeFn: [],
      }),
    );
    await player.run();
    expect(player.status).toBe('done');
    expect(player.taskStatusList[0].status).toBe('done');
    expect(aiLocate.mock.calls[0][1].uiContext).toBe(uiContext);
    expect(player.result).toEqual({ '0': element });
  });

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
    const agent = new Agent(
      {
        interfaceType: 'fixture',
        actionSpace: () => [],
        describe: () => 'sleep test page',
        size: async () => ({ width: 1, height: 1 }),
        screenshotBase64: async () =>
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      } as any,
      {
        generateReport: false,
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'test-model',
          MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
          MIDSCENE_MODEL_BASE_URL: 'https://example.invalid/v1',
          MIDSCENE_MODEL_API_KEY: 'test-key',
        },
      },
    );
    const uiContext = await agent.getUIContext();
    rs.spyOn(agent, 'getUIContext').mockResolvedValue(uiContext);
    const sleep = rs.spyOn(agent, 'sleep');
    const runtime = createLegacyYamlRuntime({
      agent,
      actionSpace: [],
      setResult: () => {},
    });
    try {
      const result = await runtime.runScript(
        { tasks: [{ name: 'sleep', flow: [{ sleep: 60_000 }] }] },
        { defaultTimeoutMs: 10 },
      );
      await runtime.waitForIdle();
      expect(sleep).toHaveBeenCalledWith(60_000, {
        abortSignal: expect.any(AbortSignal),
      });
      expect(result.cases[0].run?.steps[0].error?.code).toBe('STEP_TIMEOUT');
    } finally {
      await agent.destroy();
    }
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
