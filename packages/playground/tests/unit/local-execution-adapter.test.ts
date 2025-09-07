import type { DeviceAction } from '@midscene/core';
import { overrideAIConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalExecutionAdapter } from '../../src/adapters/local-execution';
import * as common from '../../src/common';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
} from '../../src/types';

// Mock dependencies
vi.mock('../../src/common');
vi.mock('@midscene/shared/env');
vi.mock('@midscene/core/ai-model', () => ({
  findAllMidsceneLocatorField: vi.fn(() => ['locateField']),
}));

describe('LocalExecutionAdapter', () => {
  let mockAgent: PlaygroundAgent;
  let adapter: LocalExecutionAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent = {
      getActionSpace: vi.fn(),
      callActionInActionSpace: vi.fn(),
      onTaskStartTip: vi.fn(),
      destroy: vi.fn(),
    };
    adapter = new LocalExecutionAdapter(mockAgent);
  });

  describe('constructor', () => {
    it('should initialize with agent', () => {
      expect(adapter).toBeDefined();
    });
  });

  describe('parseStructuredParams', () => {
    it('should return prompt and options when no paramSchema', async () => {
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        call: vi.fn(),
      };
      const params = { prompt: 'test prompt' };
      const options: ExecutionOptions = { deepThink: true };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      expect(result).toEqual(['test prompt', options]);
    });

    it('should parse structured params with locate field', async () => {
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: { shape: { locateField: {}, otherField: {} } } as any,
        call: vi.fn(),
      };
      const params = {
        locateField: 'button',
        otherField: 'value',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = { deepThink: true };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      expect(result).toEqual([
        'button', // locate field
        { otherField: 'value', deepThink: true, prompt: 'test prompt' }, // other params + options
      ]);
    });

    it('should handle params without locate field', async () => {
      // Mock findAllMidsceneLocatorField to return empty array
      const { findAllMidsceneLocatorField } = await import(
        '@midscene/core/ai-model'
      );
      vi.mocked(findAllMidsceneLocatorField).mockReturnValue([]);

      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: { shape: { field1: {}, field2: {} } } as any,
        call: vi.fn(),
      };
      const params = {
        field1: 'value1',
        field2: 'value2',
      };
      const options: ExecutionOptions = { deepThink: true };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      expect(result).toEqual([
        null, // no locate field
        { field1: 'value1', field2: 'value2', deepThink: true },
      ]);
    });
  });

  describe('formatErrorMessage', () => {
    it('should format extension conflict error', () => {
      const error = { message: 'something of different extension' };
      const result = adapter.formatErrorMessage(error);

      expect(result).toContain('Conflicting extension detected');
      expect(result).toContain('midscenejs.com');
    });

    it('should use basic formatting for other errors', () => {
      const error = { message: 'regular error' };
      const result = adapter.formatErrorMessage(error);

      expect(result).toBe('regular error');
    });
  });

  describe('getActionSpace', () => {
    it('should get action space from page', async () => {
      const mockActions: DeviceAction<unknown>[] = [
        { name: 'click', description: 'Click action', call: vi.fn() },
      ];
      const mockPage = {
        actionSpace: vi.fn().mockResolvedValue(mockActions),
      };

      const result = await adapter.getActionSpace(mockPage);

      expect(result).toBe(mockActions);
      expect(mockPage.actionSpace).toHaveBeenCalled();
    });
  });

  describe('checkStatus', () => {
    it('should always return true for local execution', async () => {
      const result = await adapter.checkStatus();
      expect(result).toBe(true);
    });
  });

  describe('overrideConfig', () => {
    it('should call overrideAIConfig from shared env', async () => {
      const aiConfig = { model: 'test' };

      await adapter.overrideConfig(aiConfig);

      expect(overrideAIConfig).toHaveBeenCalledWith(aiConfig);
    });
  });

  describe('executeAction', () => {
    beforeEach(() => {
      vi.mocked(common.executeAction).mockResolvedValue('test result');
    });

    it('should execute action with agent and actionSpace', async () => {
      const mockActionSpace: DeviceAction<unknown>[] = [
        { name: 'click', description: 'Click action', call: vi.fn() },
      ];
      vi.mocked(mockAgent.getActionSpace!).mockResolvedValue(mockActionSpace);

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = {};

      const result = await adapter.executeAction('click', value, options);

      expect(result).toBe('test result');
      expect(common.executeAction).toHaveBeenCalledWith(
        mockAgent,
        'click',
        mockActionSpace,
        value,
        options,
      );
    });

    it('should use empty actionSpace when agent has no getActionSpace', async () => {
      const agentWithoutActionSpace: PlaygroundAgent = {};
      const localAdapter = new LocalExecutionAdapter(agentWithoutActionSpace);

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = {};

      await localAdapter.executeAction('click', value, options);

      expect(common.executeAction).toHaveBeenCalledWith(
        agentWithoutActionSpace,
        'click',
        [],
        value,
        options,
      );
    });

    it('should setup progress tracking when requestId provided', async () => {
      const mockActionSpace: DeviceAction<unknown>[] = [];
      vi.mocked(mockAgent.getActionSpace!).mockResolvedValue(mockActionSpace);

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = { requestId: 'request-123' };

      await adapter.executeAction('click', value, options);

      expect(mockAgent.onTaskStartTip).toBeDefined();
    });

    it('should store and forward task tips', async () => {
      const mockActionSpace: DeviceAction<unknown>[] = [];
      vi.mocked(mockAgent.getActionSpace!).mockResolvedValue(mockActionSpace);

      const originalCallback = vi.fn();
      mockAgent.onTaskStartTip = originalCallback;

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = { requestId: 'request-123' };

      await adapter.executeAction('click', value, options);

      // Simulate a task tip being called
      if (mockAgent.onTaskStartTip) {
        mockAgent.onTaskStartTip('Processing...');
      }

      // Check that the tip is stored
      const progress = await adapter.getTaskProgress('request-123');
      expect(progress.tip).toBe('Processing...');

      // Check that original callback was called
      expect(originalCallback).toHaveBeenCalledWith('Processing...');
    });

    it('should cleanup progress tracking after execution', async () => {
      const mockActionSpace: DeviceAction<unknown>[] = [];
      vi.mocked(mockAgent.getActionSpace!).mockResolvedValue(mockActionSpace);

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = { requestId: 'request-123' };

      // First setup some progress
      await adapter.executeAction('click', value, options);

      // Progress should be cleaned up
      const progress = await adapter.getTaskProgress('request-123');
      expect(progress.tip).toBeUndefined();
    });

    it('should cleanup even when execution throws', async () => {
      const mockActionSpace: DeviceAction<unknown>[] = [];
      vi.mocked(mockAgent.getActionSpace!).mockResolvedValue(mockActionSpace);
      vi.mocked(common.executeAction).mockRejectedValue(
        new Error('Execution failed'),
      );

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = { requestId: 'request-123' };

      await expect(
        adapter.executeAction('click', value, options),
      ).rejects.toThrow('Execution failed');

      // Progress should still be cleaned up
      const progress = await adapter.getTaskProgress('request-123');
      expect(progress.tip).toBeUndefined();
    });
  });

  describe('getTaskProgress', () => {
    it('should return undefined tip for unknown requestId', async () => {
      const result = await adapter.getTaskProgress('unknown-id');
      expect(result).toEqual({ tip: undefined });
    });
  });

  describe('cancelTask', () => {
    it('should destroy agent successfully', async () => {
      vi.mocked(mockAgent.destroy!).mockResolvedValue(undefined);

      const result = await adapter.cancelTask('request-123');

      expect(result).toEqual({ success: true });
      expect(mockAgent.destroy).toHaveBeenCalled();
    });

    it('should return error when no agent', async () => {
      const adapterNoAgent = new LocalExecutionAdapter({});
      (adapterNoAgent as any).agent = null;

      const result = await adapterNoAgent.cancelTask('request-123');

      expect(result).toEqual({
        error: 'No active agent found for this requestId',
      });
    });

    it('should handle destroy error', async () => {
      const destroyError = new Error('Destroy failed');
      vi.mocked(mockAgent.destroy!).mockRejectedValue(destroyError);

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await adapter.cancelTask('request-123');

      expect(result).toEqual({
        error: 'Failed to cancel: Destroy failed',
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to cancel agent: Destroy failed',
      );

      consoleSpy.mockRestore();
    });
  });
});
