import { ScriptPlayer } from '@/yaml/player';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const runAdbShellParamSchema = z.object({
  command: z.string(),
});

const launchParamSchema = z.object({
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
    runAdbShell: vi.fn().mockResolvedValue('adb-result'),
    ...overrides,
  } as any;
}

describe('player action dispatch ordering', () => {
  it('should call agent.runAdbShell directly for RunAdbShell action', async () => {
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

    // Should call agent.runAdbShell directly, NOT callActionInActionSpace
    expect(agent.runAdbShell).toHaveBeenCalledWith('input tap 100 200');
    expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
  });

  it('should call agent.launch directly for Launch action', async () => {
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

    expect(agent.launch).toHaveBeenCalledWith('com.example.app');
    expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
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
      runAdbShell: vi.fn().mockResolvedValue('shell output'),
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
});
