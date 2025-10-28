import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { DeviceAction } from '../../src/types';
import type { MidsceneYamlScript, MidsceneYamlScriptEnv } from '../../src/yaml';
import { ScriptPlayer } from '../../src/yaml/player';

describe('YAML runAdbShell support via ActionSpace', () => {
  it('should execute runAdbShell command via actionSpace', async () => {
    const mockResult = 'pm clear output';

    const runAdbShellAction: DeviceAction = {
      name: 'RunAdbShell',
      description: 'Execute ADB shell command',
      interfaceAlias: 'runAdbShell',
      paramSchema: z.object({
        command: z.string().describe('ADB shell command to execute'),
      }),
      call: vi.fn(async (param: { command: string }) => mockResult),
    };

    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => [runAdbShellAction]),
      callActionInActionSpace: vi.fn(
        async (actionName: string, params: any) => {
          // Simulate the actual behavior of callActionInActionSpace
          if (actionName === 'RunAdbShell') {
            return mockResult;
          }
        },
      ),
    };

    const script: MidsceneYamlScript = {
      android: {
        deviceId: 'test-device',
      },
      tasks: [
        {
          name: 'Clear app data',
          flow: [
            {
              runAdbShell: 'pm clear com.example.app',
              name: 'clearResult',
            },
          ],
        },
      ],
    };

    const player = new ScriptPlayer<MidsceneYamlScriptEnv>(
      script,
      async () => ({ agent: mockAgent as any, freeFn: [] }),
    );

    await player.run();

    expect(mockAgent.callActionInActionSpace).toHaveBeenCalledWith(
      'RunAdbShell',
      expect.objectContaining({
        command: 'pm clear com.example.app',
      }),
    );
    expect(player.status).toBe('done');
    expect(player.result.clearResult).toBe(mockResult);
  });

  it('should throw error when runAdbShell action is not in actionSpace (non-Android agent)', async () => {
    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => []), // Empty actionSpace, no runAdbShell
      callActionInActionSpace: vi.fn(),
    };

    const script: MidsceneYamlScript = {
      web: {
        url: 'http://example.com',
      },
      tasks: [
        {
          name: 'Try runAdbShell',
          flow: [
            {
              runAdbShell: 'pm clear com.example.app',
            },
          ],
        },
      ],
    };

    const player = new ScriptPlayer<MidsceneYamlScriptEnv>(
      script,
      async () => ({ agent: mockAgent as any, freeFn: [] }),
    );

    await player.run();

    expect(player.status).toBe('error');
    expect(player.taskStatusList[0].error?.message).toContain(
      'unknown flowItem in yaml',
    );
  });

  it('should handle runAdbShell without name property', async () => {
    const mockResult = 'command output';

    const runAdbShellAction: DeviceAction = {
      name: 'RunAdbShell',
      description: 'Execute ADB shell command',
      interfaceAlias: 'runAdbShell',
      paramSchema: z.object({
        command: z.string().describe('ADB shell command to execute'),
      }),
      call: vi.fn(async (param: { command: string }) => mockResult),
    };

    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => [runAdbShellAction]),
      callActionInActionSpace: vi.fn(
        async (actionName: string, params: any) => {
          if (actionName === 'RunAdbShell') {
            return mockResult;
          }
        },
      ),
    };

    const script: MidsceneYamlScript = {
      android: {
        deviceId: 'test-device',
      },
      tasks: [
        {
          name: 'Run command',
          flow: [
            {
              runAdbShell: 'ls -la',
            },
          ],
        },
      ],
    };

    const player = new ScriptPlayer<MidsceneYamlScriptEnv>(
      script,
      async () => ({ agent: mockAgent as any, freeFn: [] }),
    );

    await player.run();

    expect(mockAgent.callActionInActionSpace).toHaveBeenCalledWith(
      'RunAdbShell',
      expect.objectContaining({
        command: 'ls -la',
      }),
    );
    expect(player.status).toBe('done');
    // When no name is provided, result is stored with auto-incremented index
    expect(player.result[0]).toBe(mockResult);
  });

  it('should validate runAdbShell command parameter', async () => {
    const mockResult = 'output';

    const runAdbShellAction: DeviceAction = {
      name: 'RunAdbShell',
      description: 'Execute ADB shell command',
      interfaceAlias: 'runAdbShell',
      paramSchema: z.object({
        command: z.string().describe('ADB shell command to execute'),
      }),
      call: vi.fn(async (param: { command: string }) => {
        if (!param.command) {
          throw new Error('Command is required for runAdbShell');
        }
        return mockResult;
      }),
    };

    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => [runAdbShellAction]),
      callActionInActionSpace: vi.fn(
        async (actionName: string, params: any) => {
          if (actionName === 'RunAdbShell') {
            // Call the actual action to trigger validation
            return await runAdbShellAction.call(params, {} as any);
          }
        },
      ),
    };

    const script: MidsceneYamlScript = {
      android: {
        deviceId: 'test-device',
      },
      tasks: [
        {
          name: 'Empty command',
          flow: [
            {
              runAdbShell: '',
            } as any,
          ],
        },
      ],
    };

    const player = new ScriptPlayer<MidsceneYamlScriptEnv>(
      script,
      async () => ({ agent: mockAgent as any, freeFn: [] }),
    );

    await player.run();

    // The validation should happen and cause an error
    expect(player.status).toBe('error');
  });
});
