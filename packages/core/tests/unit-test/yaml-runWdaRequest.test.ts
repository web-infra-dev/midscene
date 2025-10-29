import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { DeviceAction } from '../../src/types';
import type { MidsceneYamlScript, MidsceneYamlScriptEnv } from '../../src/yaml';
import { ScriptPlayer } from '../../src/yaml/player';

describe('YAML runWdaRequest support via ActionSpace', () => {
  it('should execute runWdaRequest command via actionSpace', async () => {
    const mockResult = { value: { success: true } };

    const runWdaRequestAction: DeviceAction = {
      name: 'RunWdaRequest',
      description: 'Execute WebDriverAgent API request directly',
      interfaceAlias: 'runWdaRequest',
      paramSchema: z.object({
        method: z.string().describe('HTTP method (GET, POST, DELETE, etc.)'),
        endpoint: z.string().describe('WebDriver API endpoint'),
        data: z.any().optional().describe('Optional request body data'),
      }),
      call: vi.fn(
        async (param: { method: string; endpoint: string; data?: any }) =>
          mockResult,
      ),
    };

    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => [runWdaRequestAction]),
      callActionInActionSpace: vi.fn(
        async (actionName: string, params: any) => {
          // Simulate the actual behavior of callActionInActionSpace
          if (actionName === 'RunWdaRequest') {
            return mockResult;
          }
        },
      ),
    };

    const script: MidsceneYamlScript = {
      ios: {
        launch: 'com.example.app',
      },
      tasks: [
        {
          name: 'Press home button',
          flow: [
            {
              runWdaRequest: {
                method: 'POST',
                endpoint: '/session/test/wda/pressButton',
                data: { name: 'home' },
              },
              name: 'pressResult',
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
      'RunWdaRequest',
      expect.objectContaining({
        method: 'POST',
        endpoint: '/session/test/wda/pressButton',
        data: { name: 'home' },
      }),
    );
    expect(player.status).toBe('done');
    expect(player.result.pressResult).toBe(mockResult);
  });

  it('should throw error when runWdaRequest action is not in actionSpace (non-iOS agent)', async () => {
    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => []), // Empty actionSpace, no runWdaRequest
      callActionInActionSpace: vi.fn(),
    };

    const script: MidsceneYamlScript = {
      web: {
        url: 'http://example.com',
      },
      tasks: [
        {
          name: 'Try runWdaRequest',
          flow: [
            {
              runWdaRequest: {
                method: 'GET',
                endpoint: '/wda/screen',
              },
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

  it('should handle runWdaRequest without name property', async () => {
    const mockResult = { value: { scale: 3 } };

    const runWdaRequestAction: DeviceAction = {
      name: 'RunWdaRequest',
      description: 'Execute WebDriverAgent API request directly',
      interfaceAlias: 'runWdaRequest',
      paramSchema: z.object({
        method: z.string().describe('HTTP method (GET, POST, DELETE, etc.)'),
        endpoint: z.string().describe('WebDriver API endpoint'),
        data: z.any().optional().describe('Optional request body data'),
      }),
      call: vi.fn(
        async (param: { method: string; endpoint: string; data?: any }) =>
          mockResult,
      ),
    };

    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => [runWdaRequestAction]),
      callActionInActionSpace: vi.fn(
        async (actionName: string, params: any) => {
          if (actionName === 'RunWdaRequest') {
            return mockResult;
          }
        },
      ),
    };

    const script: MidsceneYamlScript = {
      ios: {
        launch: 'com.example.app',
      },
      tasks: [
        {
          name: 'Get screen info',
          flow: [
            {
              runWdaRequest: {
                method: 'GET',
                endpoint: '/wda/screen',
              },
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
      'RunWdaRequest',
      expect.objectContaining({
        method: 'GET',
        endpoint: '/wda/screen',
      }),
    );
    expect(player.status).toBe('done');
    // When no name is provided, result is stored with auto-incremented index
    expect(player.result[0]).toBe(mockResult);
  });

  it('should validate runWdaRequest parameters', async () => {
    const mockResult = { value: { success: true } };

    const runWdaRequestAction: DeviceAction = {
      name: 'RunWdaRequest',
      description: 'Execute WebDriverAgent API request directly',
      interfaceAlias: 'runWdaRequest',
      paramSchema: z.object({
        method: z.string().describe('HTTP method (GET, POST, DELETE, etc.)'),
        endpoint: z.string().describe('WebDriver API endpoint'),
        data: z.any().optional().describe('Optional request body data'),
      }),
      call: vi.fn(
        async (param: { method: string; endpoint: string; data?: any }) => {
          if (!param.method || !param.endpoint) {
            throw new Error(
              'Method and endpoint are required for runWdaRequest',
            );
          }
          return mockResult;
        },
      ),
    };

    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => [runWdaRequestAction]),
      callActionInActionSpace: vi.fn(
        async (actionName: string, params: any) => {
          if (actionName === 'RunWdaRequest') {
            // Call the actual action to trigger validation
            return await runWdaRequestAction.call(params, {} as any);
          }
        },
      ),
    };

    const script: MidsceneYamlScript = {
      ios: {
        launch: 'com.example.app',
      },
      tasks: [
        {
          name: 'Invalid request',
          flow: [
            {
              runWdaRequest: {
                method: '',
                endpoint: '',
              } as any,
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

    // The validation should happen and cause an error
    expect(player.status).toBe('error');
  });

  it('should handle runWdaRequest with optional data parameter', async () => {
    const mockResult = { value: { success: true } };

    const runWdaRequestAction: DeviceAction = {
      name: 'RunWdaRequest',
      description: 'Execute WebDriverAgent API request directly',
      interfaceAlias: 'runWdaRequest',
      paramSchema: z.object({
        method: z.string().describe('HTTP method (GET, POST, DELETE, etc.)'),
        endpoint: z.string().describe('WebDriver API endpoint'),
        data: z.any().optional().describe('Optional request body data'),
      }),
      call: vi.fn(
        async (param: { method: string; endpoint: string; data?: any }) =>
          mockResult,
      ),
    };

    const mockAgent = {
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => ({})),
      getActionSpace: vi.fn(async () => [runWdaRequestAction]),
      callActionInActionSpace: vi.fn(
        async (actionName: string, params: any) => {
          if (actionName === 'RunWdaRequest') {
            return mockResult;
          }
        },
      ),
    };

    const script: MidsceneYamlScript = {
      ios: {
        launch: 'com.example.app',
      },
      tasks: [
        {
          name: 'Request without data',
          flow: [
            {
              runWdaRequest: {
                method: 'GET',
                endpoint: '/wda/device/info',
              },
              name: 'deviceInfo',
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
      'RunWdaRequest',
      expect.objectContaining({
        method: 'GET',
        endpoint: '/wda/device/info',
      }),
    );
    expect(player.status).toBe('done');
    expect(player.result.deviceInfo).toBe(mockResult);
  });
});
