import { ScriptPlayer } from '@/yaml/player';
import { collectLegacyYamlDocument } from '@/yaml/test-runner-compat';
import { parseYamlScript } from '@/yaml/utils';
import { describe, expect, rstest as rs, test } from '@rstest/core';

describe('legacy YAML Test Runner compatibility', () => {
  test('accepts the historical progress hint while forwarding actual aiAct options', () => {
    const document = collectLegacyYamlDocument({
      tasks: [
        {
          name: 'act',
          flow: [
            {
              aiAction: 'Open the cart',
              aiActionProgressTips: ['Opening'],
              effort: 'balance',
              cacheable: false,
            },
          ],
        },
      ],
    });
    expect(document.cases[0].definition.steps[0].input).toEqual({
      prompt: 'Open the cart',
      options: { effort: 'balance', cacheable: false },
    });
  });
  test.each(['', 'flow: null'])(
    'rejects a missing flow before acquiring resources: %s',
    (flow) => {
      const script = parseYamlScript(`tasks:
  - name: invalid
    ${flow}
`);
      const setup = rs.fn();
      expect(() => new ScriptPlayer(script, setup)).toThrow(
        'missing flow in task',
      );
      expect(setup).not.toHaveBeenCalled();
    },
  );

  test('compiles tasks to Cases and flow items to Steps with canonical public Node inputs', () => {
    const document = collectLegacyYamlDocument(
      {
        tasks: [
          {
            name: 'checkout',
            continueOnError: true,
            flow: [
              { aiTap: 'Buy now' },
              { aiWaitFor: 'Order submitted', timeout: 30_000 },
            ],
          },
        ],
      },
      '/fixtures/checkout.yaml',
    );

    expect(document.sourcePath).toBe('/fixtures/checkout.yaml');
    expect(document.cases).toHaveLength(1);
    expect(document.cases[0].definition.name).toBe('checkout');
    expect(document.cases[0].definition.onFailure).toBe('continue');
    expect(document.cases[0].definition.steps).toEqual([
      {
        node: 'aiTap',
        input: {
          prompt: 'Buy now',
          options: {},
        },
        meta: { continueOnError: false },
      },
      {
        node: 'aiWaitFor',
        input: {
          prompt: 'Order submitted',
          options: { timeoutMs: 30_000 },
        },
        meta: { continueOnError: false },
      },
    ]);
  });

  test('keeps task continueOnError behavior while exposing Runner outcomes', async () => {
    const failure = new Error('first task failed');
    const agent = {
      dump: { executions: [] },
      evaluateJavaScript: rs
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce('second task result'),
      getActionSpace: rs.fn().mockResolvedValue([]),
      reportFile: '/tmp/legacy-report.html',
      onTaskStartTip: undefined,
    };
    const player = new ScriptPlayer(
      {
        tasks: [
          {
            name: 'allowed failure',
            continueOnError: true,
            flow: [{ javascript: 'throw new Error()', name: 'first' }],
          },
          {
            name: 'next task',
            flow: [{ javascript: 'return 2', name: 'second' }],
          },
        ],
      } as any,
      async () => ({ agent: agent as any, freeFn: [] }),
      undefined,
      '/fixtures/continue.yaml',
    );

    await player.run();

    expect(player.status).toBe('done');
    expect(player.taskStatusList.map((task) => task.status)).toEqual([
      'error',
      'done',
    ]);
    expect(player.taskStatusList[0].error).toBe(failure);
    expect(player.executionResult?.cases.map((item) => item.status)).toEqual([
      'failed',
      'success',
    ]);
    expect(player.executionResult?.cases[0].run?.reportScopeId).toBe(
      player.executionResult?.document.documentRunId,
    );
    expect(player.result.second).toBe('second task result');
  });

  test('marks following tasks not-run after a non-continuable failure', async () => {
    const agent = {
      dump: { executions: [] },
      evaluateJavaScript: rs.fn().mockRejectedValue(new Error('stop here')),
      getActionSpace: rs.fn().mockResolvedValue([]),
      reportFile: null,
      onTaskStartTip: undefined,
    };
    const player = new ScriptPlayer(
      {
        tasks: [
          { name: 'failure', flow: [{ javascript: 'bad()' }] },
          { name: 'must not run', flow: [{ javascript: 'next()' }] },
        ],
      } as any,
      async () => ({ agent: agent as any, freeFn: [] }),
    );

    await player.run();

    expect(player.status).toBe('error');
    expect(player.taskStatusList.map((task) => task.status)).toEqual([
      'error',
      'init',
    ]);
    expect(player.executionResult?.cases.map((item) => item.status)).toEqual([
      'failed',
      'not-run',
    ]);
    expect(player.executionResult?.cases[1].notRunReason).toBe('bail');
    expect(agent.evaluateJavaScript).toHaveBeenCalledTimes(1);
  });

  test('links legacy Agent executions to the corresponding Runner Step', async () => {
    let dumpListener:
      | ((dump: string, execution?: { id?: string }) => void)
      | undefined;
    const agent = {
      aiAct: rs.fn().mockImplementation(async () => {
        dumpListener?.('serialized dump', { id: 'agent-execution-1' });
      }),
      addDumpUpdateListener: rs.fn().mockImplementation((listener) => {
        dumpListener = listener;
        return () => {
          dumpListener = undefined;
        };
      }),
      dump: { executions: [] },
      getActionSpace: rs.fn().mockResolvedValue([]),
      reportFile: null,
      onTaskStartTip: undefined,
    };
    const player = new ScriptPlayer(
      {
        tasks: [{ name: 'act', flow: [{ aiAct: 'Open the cart' }] }],
      } as any,
      async () => ({ agent: agent as any, freeFn: [] }),
    );

    await player.run();

    expect(player.executionResult?.cases[0].run?.steps[0]).toMatchObject({
      node: 'aiAct',
      status: 'success',
      report: {
        traces: [
          {
            type: 'midscene-execution',
            executionId: 'agent-execution-1',
          },
        ],
      },
    });
    expect(dumpListener).toBeUndefined();
  });

  test('runs the public playTask entry through the Runner kernel', async () => {
    const agent = {
      dump: { executions: [] },
      evaluateJavaScript: rs.fn().mockResolvedValue('task result'),
      reportFile: '/tmp/play-task-report.html',
    };
    const player = new ScriptPlayer(
      {
        tasks: [{ name: 'direct task', flow: [] }],
      } as any,
      async () => ({ agent: agent as any, freeFn: [] }),
    );
    const taskStatus = {
      name: 'direct task',
      flow: [{ javascript: 'return 1', name: 'value' }],
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent as any);

    expect(player.executionResult?.cases[0]).toMatchObject({
      name: 'direct task',
      status: 'success',
      run: {
        steps: [
          {
            node: 'javascript',
            status: 'success',
          },
        ],
      },
    });
    expect(taskStatus).toMatchObject({ currentStep: 0 });
    expect(player.result.value).toBe('task result');
    expect(player.reportFile).toBe('/tmp/play-task-report.html');
  });
});
