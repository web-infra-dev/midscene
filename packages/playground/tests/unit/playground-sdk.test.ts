import type { DeviceAction } from '@midscene/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('../../src/adapters/local-execution');
vi.mock('../../src/adapters/remote-execution');

describe('PlaygroundSDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create LocalExecutionAdapter for local-execution type', () => {
      const mockAgent: PlaygroundAgent = {};
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
      const mockAgentFactory = vi.fn();
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
      const mockExecuteAction = vi.fn().mockResolvedValue('test result');
      const MockAdapter = vi.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.executeAction = mockExecuteAction;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
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
  });

  describe('getActionSpace', () => {
    it('should delegate to adapter getActionSpace', async () => {
      const mockActions: DeviceAction<unknown>[] = [
        { name: 'test', description: 'Test action', call: vi.fn() },
      ];
      const mockGetActionSpace = vi.fn().mockResolvedValue(mockActions);
      const MockAdapter = vi.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.getActionSpace = mockGetActionSpace;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
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
      const mockValidateParams = vi.fn().mockReturnValue({ valid: true });
      const MockAdapter = vi.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.validateParams = mockValidateParams;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
      };

      const sdk = new PlaygroundSDK(config);
      const value: FormValue = { type: 'test', params: { test: 'value' } };
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test',
        call: vi.fn(),
      };

      const result = sdk.validateStructuredParams(value, action);

      expect(result).toEqual({ valid: true });
      expect(mockValidateParams).toHaveBeenCalledWith(value, action);
    });
  });

  describe('formatErrorMessage', () => {
    it('should delegate to adapter formatErrorMessage', () => {
      const mockFormatError = vi.fn().mockReturnValue('formatted error');
      const MockAdapter = vi.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.formatErrorMessage = mockFormatError;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
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
      const mockCreateDisplay = vi.fn().mockReturnValue('display content');
      const MockAdapter = vi.mocked(LocalExecutionAdapter);
      MockAdapter.prototype.createDisplayContent = mockCreateDisplay;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
      };

      const sdk = new PlaygroundSDK(config);
      const value: FormValue = { type: 'test', prompt: 'test' };
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test',
        call: vi.fn(),
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
        agent: {},
      };

      const sdk = new PlaygroundSDK(config);
      const result = await sdk.checkStatus();

      expect(result).toBe(true);
    });

    it('should delegate to RemoteExecutionAdapter checkStatus', async () => {
      const mockCheckStatus = vi.fn().mockResolvedValue(false);
      const MockAdapter = vi.mocked(RemoteExecutionAdapter);
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
    it('should be no-op for LocalExecutionAdapter', async () => {
      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
      };

      const sdk = new PlaygroundSDK(config);
      const aiConfig = { model: 'test' };

      // Should not throw
      await sdk.overrideConfig(aiConfig);
    });

    it('should delegate to RemoteExecutionAdapter overrideConfig', async () => {
      const mockOverrideConfig = vi.fn().mockResolvedValue(undefined);
      const MockAdapter = vi.mocked(RemoteExecutionAdapter);
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

  describe('cancelTask', () => {
    it('should return error message for LocalExecutionAdapter', async () => {
      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
      };

      const sdk = new PlaygroundSDK(config);
      const result = await sdk.cancelTask('request-123');

      expect(result).toEqual({
        error: 'Cancel task not supported in local execution mode',
      });
    });

    it('should delegate to RemoteExecutionAdapter cancelTask', async () => {
      const mockCancelTask = vi.fn().mockResolvedValue({ success: true });
      const MockAdapter = vi.mocked(RemoteExecutionAdapter);
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
});
