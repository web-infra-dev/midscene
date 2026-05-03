import { buildYamlFlowFromPlans } from '@/common';
import { ScriptPlayer } from '@/yaml/player';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const runAdbShellParamSchema = z.object({
  command: z.string(),
});

const launchParamSchema = z.object({
  uri: z.string(),
});

const terminateParamSchema = z.object({
  uri: z.string(),
});

/**
 * Creates a minimal ScriptPlayer instance with given actionSpace injected,
 * then calls playTask to exercise the action dispatch logic in player.ts.
 */
function createPlayerWithActionSpace(actionSpace: any[]) {
  const script = { tasks: [{ name: 'test', flow: [] }] };
  const player = new ScriptPlayer(
    script as any,
    async () => ({ agent: {} as any, freeFn: [] }),
    undefined,
  );
  // Inject actionSpace directly (normally set during run())
  (player as any).actionSpace = actionSpace;
  return player;
}

function createMockAgent(overrides: Record<string, any> = {}) {
  return {
    callActionInActionSpace: vi.fn().mockResolvedValue('action-result'),
    launch: vi.fn().mockResolvedValue('launch-result'),
    terminate: vi.fn().mockResolvedValue('terminate-result'),
    runAdbShell: vi.fn().mockResolvedValue('adb-result'),
    ...overrides,
  } as any;
}

describe('player action dispatch ordering', () => {
  it('should dispatch RunAdbShell string param via callActionInActionSpace', async () => {
    const actionSpace = [
      {
        name: 'RunAdbShell',
        interfaceAlias: 'runAdbShell',
        paramSchema: runAdbShellParamSchema,
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = createMockAgent();

    const taskStatus = {
      name: 'test',
      flow: [{ runAdbShell: 'input tap 100 200' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('RunAdbShell', {
      command: 'input tap 100 200',
    });
    expect(agent.runAdbShell).not.toHaveBeenCalled();
  });

  it('should dispatch Launch string param via callActionInActionSpace', async () => {
    const actionSpace = [
      {
        name: 'Launch',
        interfaceAlias: 'launch',
        paramSchema: launchParamSchema,
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = createMockAgent();

    const taskStatus = {
      name: 'test',
      flow: [{ launch: 'com.example.app' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Launch', {
      uri: 'com.example.app',
    });
    expect(agent.launch).not.toHaveBeenCalled();
  });

  it('should dispatch Terminate string param via callActionInActionSpace', async () => {
    const actionSpace = [
      {
        name: 'Terminate',
        interfaceAlias: 'terminate',
        paramSchema: terminateParamSchema,
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = createMockAgent();

    const taskStatus = {
      name: 'test',
      flow: [{ terminate: 'com.example.app' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Terminate', {
      uri: 'com.example.app',
    });
    expect(agent.terminate).not.toHaveBeenCalled();
  });

  it('should call callActionInActionSpace for generic string param action with paramSchema', async () => {
    const actionSpace = [
      {
        name: 'CustomAction',
        interfaceAlias: 'customAction',
        paramSchema: z.string(),
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = createMockAgent();

    const taskStatus = {
      name: 'test',
      flow: [{ customAction: 'some-param' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith(
      'CustomAction',
      'some-param',
    );
  });

  it('should keep generic string param actions on callActionInActionSpace', async () => {
    const actionSpace = [
      {
        name: 'MyAction',
        interfaceAlias: 'myAction',
        paramSchema: z.string(),
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = createMockAgent();

    const taskStatus = {
      name: 'test',
      flow: [{ myAction: 'hello world' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith(
      'MyAction',
      'hello world',
    );
  });

  it('should wrap Launch string params when helper is unavailable', async () => {
    const actionSpace = [
      {
        name: 'Launch',
        interfaceAlias: 'launch',
        paramSchema: launchParamSchema,
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = {
      callActionInActionSpace: vi.fn().mockResolvedValue('launch-via-action'),
    } as any;

    const taskStatus = {
      name: 'test',
      flow: [{ launch: 'com.example.app' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Launch', {
      uri: 'com.example.app',
    });
  });

  it('should wrap Terminate string params when helper is unavailable', async () => {
    const actionSpace = [
      {
        name: 'Terminate',
        interfaceAlias: 'terminate',
        paramSchema: terminateParamSchema,
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = {
      callActionInActionSpace: vi
        .fn()
        .mockResolvedValue('terminate-via-action'),
    } as any;

    const taskStatus = {
      name: 'test',
      flow: [{ terminate: 'com.example.app' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Terminate', {
      uri: 'com.example.app',
    });
  });

  it('should store result when action returns a value', async () => {
    const actionSpace = [
      {
        name: 'RunAdbShell',
        interfaceAlias: 'runAdbShell',
        paramSchema: runAdbShellParamSchema,
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = createMockAgent({
      callActionInActionSpace: vi.fn().mockResolvedValue('shell output'),
    });

    const taskStatus = {
      name: 'test',
      flow: [{ runAdbShell: 'getprop ro.build.version', name: 'version' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(player.result.version).toBe('shell output');
  });

  it('should wrap RunAdbShell string params when helper is unavailable', async () => {
    const actionSpace = [
      {
        name: 'RunAdbShell',
        interfaceAlias: 'runAdbShell',
        paramSchema: runAdbShellParamSchema,
      },
    ];
    const player = createPlayerWithActionSpace(actionSpace);
    const agent = {
      callActionInActionSpace: vi.fn().mockResolvedValue('fallback-result'),
    } as any;

    const taskStatus = {
      name: 'test',
      flow: [{ runAdbShell: 'ls /sdcard' }],
      index: 0,
      status: 'running' as const,
      totalSteps: 1,
    };

    await player.playTask(taskStatus, agent);

    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('RunAdbShell', {
      command: 'ls /sdcard',
    });
  });

  describe('player variable interpolation', () => {
    it('should replace $var with stored result value', async () => {
      const player = createPlayerWithActionSpace([]);
      const agent = createMockAgent();
      player.result.product_id = '110';

      const taskStatus = {
        name: 'test',
        flow: [{ aiInput: 'search box', value: '$product_id' }],
        index: 0,
        status: 'running' as const,
        totalSteps: 1,
      };

      await player.playTask(taskStatus, agent);

      expect(agent.callActionInActionSpace).toHaveBeenCalledWith(
        'Input',
        expect.objectContaining({ value: '110' }),
      );
    });

    it('should preserve non-string types for $var replacement', async () => {
      const player = createPlayerWithActionSpace([]);
      const agent = createMockAgent();
      player.result.count = 42;

      const taskStatus = {
        name: 'test',
        flow: [{ aiInput: 'qty field', value: '$count' }],
        index: 0,
        status: 'running' as const,
        totalSteps: 1,
      };

      await player.playTask(taskStatus, agent);

      expect(agent.callActionInActionSpace).toHaveBeenCalledWith(
        'Input',
        expect.objectContaining({ value: '42' }),
      );
    });

    it('should interpolate ${var} inside strings', async () => {
      const player = createPlayerWithActionSpace([]);
      const agent = createMockAgent({
        aiQuery: vi.fn().mockResolvedValue('query-result'),
      });
      player.result.product_id = '110';

      const taskStatus = {
        name: 'test',
        flow: [{ aiQuery: 'search for product-${product_id}', name: 'result' }],
        index: 0,
        status: 'running' as const,
        totalSteps: 1,
      };

      await player.playTask(taskStatus, agent);

      expect(agent.aiQuery).toHaveBeenCalledWith(
        'search for product-110',
        expect.anything(),
      );
    });

    it('should throw when referencing undefined variable', async () => {
      const player = createPlayerWithActionSpace([]);
      const agent = createMockAgent();

      const taskStatus = {
        name: 'test',
        flow: [{ aiInput: 'search box', value: '$undefined_var' }],
        index: 0,
        status: 'running' as const,
        totalSteps: 1,
      };

      await expect(player.playTask(taskStatus, agent)).rejects.toThrow(
        'Variable "undefined_var" is not defined',
      );
    });

    it('should replace variables in nested objects', async () => {
      const player = createPlayerWithActionSpace([]);
      const agent = createMockAgent({
        aiTap: vi.fn().mockResolvedValue('tap-result'),
      });
      player.result.prompt_text = 'search box';

      const taskStatus = {
        name: 'test',
        flow: [
          {
            aiTap: { prompt: '$prompt_text' },
          },
        ],
        index: 0,
        status: 'running' as const,
        totalSteps: 1,
      };

      await player.playTask(taskStatus, agent);

      expect(agent.aiTap).toHaveBeenCalledWith('search box', expect.anything());
    });
  });

  it('round-trip: cached plan → buildYamlFlowFromPlans → player dispatches with correct param', async () => {
    // Regression for the cache-replay bug: a Terminate plan was serialized as
    // { terminate: '', uri: '...' }, then replayed as agent.terminate('').
    const actionSpaceDefs = [
      {
        name: 'Terminate',
        interfaceAlias: 'terminate',
        paramSchema: terminateParamSchema,
      },
      {
        name: 'Launch',
        interfaceAlias: 'launch',
        paramSchema: launchParamSchema,
      },
      {
        name: 'RunAdbShell',
        interfaceAlias: 'runAdbShell',
        paramSchema: runAdbShellParamSchema,
      },
    ];

    const flow = buildYamlFlowFromPlans(
      [
        { type: 'Terminate', param: { uri: 'com.mi.car.mobile' } },
        { type: 'Launch', param: { uri: 'com.mi.car.mobile' } },
        { type: 'RunAdbShell', param: { command: 'input keyevent 3' } },
      ],
      actionSpaceDefs.map((def) => ({ ...def, call: async () => {} })),
    );

    const player = createPlayerWithActionSpace(actionSpaceDefs);
    const agent = createMockAgent();

    await player.playTask(
      {
        name: 'test',
        flow,
        index: 0,
        status: 'running' as const,
        totalSteps: flow.length,
      },
      agent,
    );

    expect(agent.callActionInActionSpace).toHaveBeenNthCalledWith(
      1,
      'Terminate',
      { uri: 'com.mi.car.mobile' },
    );
    expect(agent.callActionInActionSpace).toHaveBeenNthCalledWith(2, 'Launch', {
      uri: 'com.mi.car.mobile',
    });
    expect(agent.callActionInActionSpace).toHaveBeenNthCalledWith(
      3,
      'RunAdbShell',
      { command: 'input keyevent 3' },
    );
  });
});
