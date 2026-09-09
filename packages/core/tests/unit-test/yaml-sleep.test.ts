import { Agent } from '@/agent';
import type { AbstractInterface } from '@/device';
import { ScriptPlayer } from '@/yaml/player';
import { parseYamlScript } from '@/yaml/utils';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

describe('YAML sleep', () => {
  afterEach(() => {
    rs.useRealTimers();
  });

  it('waits exactly the requested timer duration and emits the completed dump', async () => {
    const agent = new Agent(
      {
        interfaceType: 'mock',
        actionSpace: () => [],
      } as unknown as AbstractInterface,
      { generateReport: false },
    );
    const listener = rs.fn();
    agent.onDumpUpdate = listener;
    rs.useFakeTimers();
    try {
      const waiting = agent.sleep(3000);
      expect(
        JSON.parse(agent.dumpDataString()).executions[0].tasks[0].status,
      ).toBe('running');
      await rs.advanceTimersByTimeAsync(2999);
      expect(listener).not.toHaveBeenCalled();
      await rs.advanceTimersByTimeAsync(1);
      await waiting;
      expect(listener).toHaveBeenCalledOnce();
      const task = JSON.parse(agent.dumpDataString()).executions[0].tasks[0];
      expect(task.status).toBe('finished');
      expect(task.timing.cost).toBe(3000);
    } finally {
      rs.useRealTimers();
      await agent.destroy();
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid SDK duration %s without creating a report entry',
    async (duration) => {
      const agent = new Agent(
        {
          interfaceType: 'mock',
          actionSpace: () => [],
        } as unknown as AbstractInterface,
        { generateReport: false },
      );
      try {
        await expect(agent.sleep(duration)).rejects.toThrow(
          'finite number greater than 0',
        );
        expect(JSON.parse(agent.dumpDataString()).executions).toHaveLength(0);
      } finally {
        await agent.destroy();
      }
    },
  );

  it.each(['20', '"20"'])(
    'records sleep: %s with its duration and execution timing',
    async (duration) => {
      const screenshotBase64 = rs.fn(() => {
        throw new Error('Sleep must not capture screenshots');
      });
      const beforeInvokeAction = rs.fn();
      const afterInvokeAction = rs.fn();
      const agent = new Agent(
        {
          interfaceType: 'mock',
          actionSpace: () => [],
          screenshotBase64,
          beforeInvokeAction,
          afterInvokeAction,
        } as unknown as AbstractInterface,
        { generateReport: false },
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
        expect(screenshotBase64).not.toHaveBeenCalled();
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
        expect(
          task.timing.callActionEnd - task.timing.callActionStart,
        ).toBeGreaterThanOrEqual(19);
      } finally {
        await agent.destroy();
      }
    },
  );

  it.each([0, -1, 'invalid'])(
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
