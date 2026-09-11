import { Agent } from '@/agent';
import type { AbstractInterface } from '@/device';
import { ScriptPlayer } from '@/yaml/player';
import { parseYamlScript } from '@/yaml/utils';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
    describe: () => 'sleep test page',
    size: async () => ({ width: 1, height: 1 }),
    screenshotBase64: rs.fn(
      async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    ),
  };
}

describe('YAML sleep', () => {
  afterEach(() => {
    rs.useRealTimers();
  });

  it('waits exactly the requested timer duration and emits the completed dump', async () => {
    const agent = new Agent(
      createMockInterface() as unknown as AbstractInterface,
      {
        generateReport: false,
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'test-model',
          MIDSCENE_MODEL_BASE_URL: 'https://example.invalid/v1',
          MIDSCENE_MODEL_API_KEY: 'test-key',
        },
      },
    );
    // Keep image decoding outside the fake-clock test; YAML cases below
    // exercise the real screenshot pipeline.
    const uiContext = await agent.getUIContext();
    rs.spyOn(agent, 'getUIContext').mockResolvedValue(uiContext);
    const listener = rs.fn();
    agent.onDumpUpdate = listener;
    rs.useFakeTimers();
    try {
      const waiting = agent.sleep(3000);
      await rs.advanceTimersByTimeAsync(0);
      expect(
        JSON.parse(agent.dumpDataString()).executions[0].tasks[0].status,
      ).toBe('running');
      await rs.advanceTimersByTimeAsync(2999);
      expect(
        JSON.parse(agent.dumpDataString()).executions[0].tasks[0].status,
      ).toBe('running');
      await rs.advanceTimersByTimeAsync(1);
      await waiting;
      expect(listener).toHaveBeenCalled();
      const task = JSON.parse(agent.dumpDataString()).executions[0].tasks[0];
      expect(task.status).toBe('finished');
      expect(task.timing.cost).toBe(3000);
    } finally {
      rs.useRealTimers();
      await agent.destroy();
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'records invalid SDK duration %s as a failed task',
    async (duration) => {
      const agent = new Agent(
        createMockInterface() as unknown as AbstractInterface,
        {
          generateReport: false,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'test-model',
            MIDSCENE_MODEL_BASE_URL: 'https://example.invalid/v1',
            MIDSCENE_MODEL_API_KEY: 'test-key',
          },
        },
      );
      try {
        await expect(agent.sleep(duration)).rejects.toThrow(
          'finite number greater than 0',
        );
        const dump = JSON.parse(agent.dumpDataString());
        expect(dump.executions).toHaveLength(1);
        expect(dump.executions[0].tasks[0]).toMatchObject({
          status: 'failed',
          subType: 'Sleep',
          errorMessage: expect.stringContaining('finite number greater than 0'),
        });
      } finally {
        await agent.destroy();
      }
    },
  );

  it.each(['20', '"20"'])(
    'records sleep: %s with its duration and execution timing',
    async (duration) => {
      const mockInterface = createMockInterface();
      const beforeInvokeAction = rs.fn();
      const afterInvokeAction = rs.fn();
      const agent = new Agent(
        {
          ...mockInterface,
          beforeInvokeAction,
          afterInvokeAction,
        } as unknown as AbstractInterface,
        {
          generateReport: false,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'test-model',
            MIDSCENE_MODEL_BASE_URL: 'https://example.invalid/v1',
            MIDSCENE_MODEL_API_KEY: 'test-key',
          },
        },
      );
      const script = parseYamlScript(`
tasks:
  - name: wait
    flow:
      - sleep: ${duration}
`);
      const player = new ScriptPlayer(script, async () => ({
        agent,
        freeFn: [],
      }));

      try {
        await player.run();

        expect(player.taskStatusList[0].error).toBeUndefined();
        expect(player.status).toBe('done');
        expect(mockInterface.screenshotBase64).toHaveBeenCalledTimes(2);
        expect(beforeInvokeAction).not.toHaveBeenCalled();
        expect(afterInvokeAction).not.toHaveBeenCalled();
        const dump = JSON.parse(agent.dumpDataString());
        expect(dump.executions).toHaveLength(1);
        const [task] = dump.executions[0].tasks;
        expect(task).toMatchObject({
          type: 'Action Space',
          subType: 'Sleep',
          param: { timeMs: 20 },
          status: 'finished',
        });
        expect(task.uiContext.screenshot).toBeDefined();
        expect(task.recorder).toEqual([
          expect.objectContaining({
            type: 'screenshot',
            timing: 'after-calling',
          }),
        ]);
        expect(
          task.timing.callActionEnd - task.timing.callActionStart,
        ).toBeGreaterThanOrEqual(19);
      } finally {
        await agent.destroy();
      }
    },
  );

  it.each([0, -1, Number.POSITIVE_INFINITY, 'invalid'])(
    'rejects invalid duration %s before dispatching an action',
    async (duration) => {
      const agent = { sleep: rs.fn() };
      const player = new ScriptPlayer({ tasks: [] }, async () => ({
        agent: agent as unknown as Agent,
        freeFn: [],
      }));

      await expect(
        player.playTask(
          {
            name: 'wait',
            flow: [{ sleep: duration } as any],
            status: 'running',
            totalSteps: 1,
          },
          agent as unknown as Agent,
        ),
      ).rejects.toThrow('ms for sleep must be greater than 0');
      expect(agent.sleep).not.toHaveBeenCalled();
    },
  );
});
