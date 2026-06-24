import type { DeviceAction } from '@midscene/core';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { LocalExecutionAdapter } from '../../src/adapters/local-execution';
import { RemoteExecutionAdapter } from '../../src/adapters/remote-execution';
import { PlaygroundSDK } from '../../src/sdk';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  PlaygroundConfig,
} from '../../src/types';

// Mock the adapters
// TODO(rstest): drop { mock: true } when bare auto-automock lands — https://github.com/web-infra-dev/rspack/pull/14418
rs.mock('../../src/adapters/local-execution', { mock: true });
rs.mock('../../src/adapters/remote-execution', { mock: true });

const createMockPlaygroundAgent = (
  partial: Partial<PlaygroundAgent> = {},
): PlaygroundAgent => partial as PlaygroundAgent;

describe('PlaygroundSDK', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create LocalExecutionAdapter for local-execution type', () => {
      const mockAgent = createMockPlaygroundAgent();
      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: mockAgent,
      };

      new PlaygroundSDK(config);

      expect(LocalExecutionAdapter).toHaveBeenCalledWith(mockAgent, undefined);
    });

    it('should create RemoteExecutionAdapter for remote-execution type', () => {
      const config: PlaygroundConfig = {
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      };

      new PlaygroundSDK(config);

      expect(RemoteExecutionAdapter).toHaveBeenCalledWith(
        'http://localhost:3000',
      );
    });

    it('should throw error for local-execution without agent or agentFactory', () => {
      const config: PlaygroundConfig = {
        type: 'local-execution',
      };

      expect(() => new PlaygroundSDK(config)).toThrow(
        'Agent or agentFactory is required for local execution',
      );
    });

    it('should create LocalExecutionAdapter with only agentFactory', () => {
      const mockAgentFactory = rs.fn();
      const config: PlaygroundConfig = {
        type: 'local-execution',
        agentFactory: mockAgentFactory,
      };

      const sdk = new PlaygroundSDK(config);
      expect(sdk).toBeDefined();
      expect(LocalExecutionAdapter).toHaveBeenCalledWith(
        undefined,
        mockAgentFactory,
      );
    });

    it('should throw error for unsupported execution type', () => {
      const config = {
        type: 'unsupported-type',
      } as unknown as PlaygroundConfig;

      expect(() => new PlaygroundSDK(config)).toThrow(
        'Unsupported execution type: unsupported-type',
      );
    });
  });

  describe('executeAction', () => {
    it('should delegate to adapter executeAction', async () => {
      const mockExecuteAction = rs.fn().mockResolvedValue('test result');
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.executeAction = mockExecuteAction;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const value: FormValue = { type: 'test', prompt: 'test prompt' };
      const options: ExecutionOptions = {};

      const result = await sdk.executeAction('testAction', value, options);

      expect(result).toBe('test result');
      expect(mockExecuteAction).toHaveBeenCalledWith(
        'testAction',
        value,
        options,
      );
    });

    it('should run beforeAction hook before delegating execution', async () => {
      const callOrder: string[] = [];
      const mockExecuteAction = rs.fn().mockImplementation(async () => {
        callOrder.push('adapter');
        return 'test result';
      });
      const beforeActionHook = rs.fn().mockImplementation(async () => {
        callOrder.push('hook');
      });
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.executeAction = mockExecuteAction;

      const sdk = new PlaygroundSDK({
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      });
      sdk.setBeforeActionHook(beforeActionHook);

      const value: FormValue = { type: 'test', prompt: 'test prompt' };
      const options: ExecutionOptions = {};

      await sdk.executeAction('testAction', value, options);

      expect(beforeActionHook).toHaveBeenCalledWith(
        'testAction',
        value,
        options,
      );
      expect(callOrder).toEqual(['hook', 'adapter']);
    });

    it('should allow clearing the beforeAction hook', async () => {
      const mockExecuteAction = rs.fn().mockResolvedValue('test result');
      const beforeActionHook = rs.fn();
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.executeAction = mockExecuteAction;

      const sdk = new PlaygroundSDK({
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      });
      sdk.setBeforeActionHook(beforeActionHook);
      sdk.setBeforeActionHook(undefined);

      await sdk.executeAction('testAction', { type: 'test' }, {});

      expect(beforeActionHook).not.toHaveBeenCalled();
      expect(mockExecuteAction).toHaveBeenCalledOnce();
    });
  });

  describe('getActionSpace', () => {
    it('should delegate to adapter getActionSpace', async () => {
      const mockActions: DeviceAction<unknown>[] = [
        { name: 'test', description: 'Test action', call: rs.fn() },
      ];
      const mockGetActionSpace = rs.fn().mockResolvedValue(mockActions);
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.getActionSpace = mockGetActionSpace;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const context = { test: 'context' };

      const result = await sdk.getActionSpace(context);

      expect(result).toBe(mockActions);
      expect(mockGetActionSpace).toHaveBeenCalledWith(context);
    });
  });

  describe('validateStructuredParams', () => {
    it('should delegate to adapter validateParams', () => {
      const mockValidateParams = rs.fn().mockReturnValue({ valid: true });
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.validateParams = mockValidateParams;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const value: FormValue = { type: 'test', params: { test: 'value' } };
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test',
        call: rs.fn(),
      };

      const result = sdk.validateStructuredParams(value, action);

      expect(result).toEqual({ valid: true });
      expect(mockValidateParams).toHaveBeenCalledWith(value, action);
    });
  });

  describe('formatErrorMessage', () => {
    it('should delegate to adapter formatErrorMessage', () => {
      const mockFormatError = rs.fn().mockReturnValue('formatted error');
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.formatErrorMessage = mockFormatError;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const error = new Error('test error');

      const result = sdk.formatErrorMessage(error);

      expect(result).toBe('formatted error');
      expect(mockFormatError).toHaveBeenCalledWith(error);
    });
  });

  describe('createDisplayContent', () => {
    it('should delegate to adapter createDisplayContent', () => {
      const mockCreateDisplay = rs.fn().mockReturnValue('display content');
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.createDisplayContent = mockCreateDisplay;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const value: FormValue = { type: 'test', prompt: 'test' };
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test',
        call: rs.fn(),
      };

      const result = sdk.createDisplayContent(value, true, action);

      expect(result).toBe('display content');
      expect(mockCreateDisplay).toHaveBeenCalledWith(value, true, action);
    });
  });

  describe('checkStatus', () => {
    it('should return true for LocalExecutionAdapter', async () => {
      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const result = await sdk.checkStatus();

      expect(result).toBe(true);
    });

    it('should delegate to RemoteExecutionAdapter checkStatus', async () => {
      const mockCheckStatus = rs.fn().mockResolvedValue(false);
      const MockAdapter = rs.mocked(RemoteExecutionAdapter);
      MockAdapter.prototype.checkStatus = mockCheckStatus;

      const config: PlaygroundConfig = {
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      };

      const sdk = new PlaygroundSDK(config);
      const result = await sdk.checkStatus();

      expect(result).toBe(false);
      expect(mockCheckStatus).toHaveBeenCalled();
    });
  });

  describe('overrideConfig', () => {
    it('should delegate to LocalExecutionAdapter overrideConfig', async () => {
      const mockOverrideConfig = rs.fn().mockResolvedValue(undefined);
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.overrideConfig = mockOverrideConfig;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const aiConfig = { model: 'test' };

      await sdk.overrideConfig(aiConfig);

      expect(mockOverrideConfig).toHaveBeenCalledWith(aiConfig);
    });

    it('should delegate to RemoteExecutionAdapter overrideConfig', async () => {
      const mockOverrideConfig = rs.fn().mockResolvedValue(undefined);
      const MockAdapter = rs.mocked(RemoteExecutionAdapter);
      MockAdapter.prototype.overrideConfig = mockOverrideConfig;

      const config: PlaygroundConfig = {
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      };

      const sdk = new PlaygroundSDK(config);
      const aiConfig = { model: 'test' };

      await sdk.overrideConfig(aiConfig);

      expect(mockOverrideConfig).toHaveBeenCalledWith(aiConfig);
    });
  });

  describe('runConnectivityTest', () => {
    it('should delegate to LocalExecutionAdapter', async () => {
      const mockRunConnectivityTest = rs.fn().mockResolvedValue({
        passed: true,
        checks: [],
      });
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.runConnectivityTest = mockRunConnectivityTest;

      const sdk = new PlaygroundSDK({
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      });

      const result = await sdk.runConnectivityTest();

      expect(result.passed).toBe(true);
      expect(mockRunConnectivityTest).toHaveBeenCalled();
    });

    it('should delegate to RemoteExecutionAdapter', async () => {
      const mockRunConnectivityTest = rs.fn().mockResolvedValue({
        passed: true,
        checks: [],
      });
      const MockAdapter = rs.mocked(RemoteExecutionAdapter);
      MockAdapter.prototype.runConnectivityTest = mockRunConnectivityTest;

      const sdk = new PlaygroundSDK({
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      });

      const result = await sdk.runConnectivityTest();

      expect(result.passed).toBe(true);
      expect(mockRunConnectivityTest).toHaveBeenCalled();
    });
  });

  describe('cancelTask', () => {
    it('should return error message for LocalExecutionAdapter', async () => {
      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      };

      const sdk = new PlaygroundSDK(config);
      const result = await sdk.cancelTask('request-123');

      expect(result).toEqual({
        error: 'Cancel task not supported in local execution mode',
      });
    });

    it('should delegate to RemoteExecutionAdapter cancelTask', async () => {
      const mockCancelTask = rs.fn().mockResolvedValue({ success: true });
      const MockAdapter = rs.mocked(RemoteExecutionAdapter);
      MockAdapter.prototype.cancelTask = mockCancelTask;

      const config: PlaygroundConfig = {
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      };

      const sdk = new PlaygroundSDK(config);
      const result = await sdk.cancelTask('request-123');

      expect(result).toEqual({ success: true });
      expect(mockCancelTask).toHaveBeenCalledWith('request-123');
    });
  });

  describe('runtime metadata APIs', () => {
    it('should delegate runtime metadata methods to the local adapter', async () => {
      const MockAdapter = rs.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.getRuntimeInfo = rs.fn().mockResolvedValue({
        interface: { type: 'web' },
        preview: { kind: 'screenshot', capabilities: [] },
        executionUxHints: [],
        metadata: {},
      });
      const sdk = new PlaygroundSDK({
        type: 'local-execution',
        agent: createMockPlaygroundAgent(),
      });

      await expect(sdk.getRuntimeInfo()).resolves.toMatchObject({
        interface: { type: 'web' },
        preview: {
          kind: 'screenshot',
        },
      });
    });

    it('should delegate runtime metadata methods to the remote adapter', async () => {
      const MockAdapter = rs.mocked(RemoteExecutionAdapter);
      MockAdapter.prototype.getRuntimeInfo = rs.fn().mockResolvedValue({
        interface: { type: 'ios' },
        preview: { kind: 'mjpeg', capabilities: [] },
        executionUxHints: ['hint'],
        metadata: {},
      });
      const sdk = new PlaygroundSDK({
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      });

      await expect(sdk.getRuntimeInfo()).resolves.toMatchObject({
        interface: { type: 'ios' },
        preview: {
          kind: 'mjpeg',
        },
      });
    });
  });
});
