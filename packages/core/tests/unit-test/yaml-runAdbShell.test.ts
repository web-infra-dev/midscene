import { describe, expect, it, vi } from 'vitest';
import type { MidsceneYamlScript, MidsceneYamlScriptEnv } from '../../src/yaml';
import { ScriptPlayer } from '../../src/yaml/player';

describe('YAML runAdbShell support', () => {
  it('should execute runAdbShell command when available on agent', async () => {
    const mockResult = 'pm clear output';
    const mockAgent = {
      runAdbShell: vi.fn(async (command: string) => mockResult),
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => []),
      callActionInActionSpace: vi.fn(),
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

    expect(mockAgent.runAdbShell).toHaveBeenCalledWith(
      'pm clear com.example.app',
    );
    expect(player.status).toBe('done');
    expect(player.result.clearResult).toBe(mockResult);
  });

  it('should throw error when runAdbShell is used on non-Android agent', async () => {
    const mockAgent = {
      // No runAdbShell method
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => []),
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
      'runAdbShell is only supported on Android agents',
    );
  });

  it('should handle runAdbShell without name property', async () => {
    const mockResult = 'command output';
    const mockAgent = {
      runAdbShell: vi.fn(async (command: string) => mockResult),
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => []),
      callActionInActionSpace: vi.fn(),
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

    expect(mockAgent.runAdbShell).toHaveBeenCalledWith('ls -la');
    expect(player.status).toBe('done');
    // When no name is provided, result is stored with auto-incremented index
    expect(player.result[0]).toBe(mockResult);
  });

  it('should throw error when runAdbShell command is missing', async () => {
    const mockAgent = {
      runAdbShell: vi.fn(),
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => []),
      callActionInActionSpace: vi.fn(),
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

    expect(player.status).toBe('error');
    expect(player.taskStatusList[0].error?.message).toContain(
      'missing command for runAdbShell',
    );
  });
});
