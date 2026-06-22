import type { DeviceAction } from '@midscene/core';
import { ReportActionDump, runConnectivityTest } from '@midscene/core';
import {
  globalModelConfigManager,
  overrideAIConfig,
} from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { LocalExecutionAdapter } from '../../src/adapters/local-execution';
import * as common from '../../src/common';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
} from '../../src/types';

import * as coreActual from '@midscene/core' with { rstest: 'importActual' };
import * as commonActual from '../../src/common' with {
  rstest: 'importActual',
};

// Mock dependencies
rs.mock('@midscene/core', () => ({
  ...coreActual,
  runConnectivityTest: rs.fn(),
}));

// TODO(rstest): drop { mock: true } when bare auto-automock lands — https://github.com/web-infra-dev/rspack/pull/14418
rs.mock('@midscene/shared/env', { mock: true });

// Import the real parseStructuredParams function for use in adapter
rs.mock('../../src/common', () => ({
  ...commonActual,
  executeAction: rs.fn(),
}));

describe('LocalExecutionAdapter', () => {
  let mockAgent: PlaygroundAgent;
  let adapter: LocalExecutionAdapter;

  beforeEach(() => {
    rs.clearAllMocks();
    mockAgent = {
      getActionSpace: rs.fn(),
      callActionInActionSpace: rs.fn(),
      onTaskStartTip: rs.fn(),
      destroy: rs.fn(),
      dumpDataString: rs
        .fn()
        .mockReturnValue(JSON.stringify({ executions: [{}] })),
      reportHTMLString: rs.fn().mockReturnValue(''),
      writeOutActionDumps: rs.fn(),
      resetDump: rs.fn(),
      addDumpUpdateListener: rs.fn(() => rs.fn()), // Returns a remove function
      removeDumpUpdateListener: rs.fn(),
    } as unknown as PlaygroundAgent;
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
        call: rs.fn(),
      };
      const params = { prompt: 'test prompt' };
      const options: ExecutionOptions = { deepLocate: true };

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
        call: rs.fn(),
      };
      const params = {
        locateField: 'button',
        otherField: 'value',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = { deepLocate: true };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      // The actual implementation merges all params and options into a single object
      expect(result).toEqual([
        {
          deepLocate: true,
          locateField: expect.any(Object), // This will be a detailed locate param object
          otherField: 'value',
        },
      ]);
    });

    it('should handle params without locate field', async () => {
      // Mock findAllMidsceneLocatorField to return empty array
      const { findAllMidsceneLocatorField } = await import(
        '@midscene/core/ai-model'
      );
      rs.mocked(findAllMidsceneLocatorField).mockReturnValue([]);

      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: { shape: { field1: {}, field2: {} } } as any,
        call: rs.fn(),
      };
      const params = {
        field1: 'value1',
        field2: 'value2',
      };
      const options: ExecutionOptions = { deepLocate: true };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      expect(result).toEqual([
        {
          deepLocate: true,
          field1: 'value1',
          field2: 'value2',
        },
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
        { name: 'click', description: 'Click action', call: rs.fn() },
      ];
      const mockPage = {
        actionSpace: rs.fn().mockResolvedValue(mockActions),
      };

      // Make sure the agent doesn't have getActionSpace, so it falls back to context
      (mockAgent as any).getActionSpace = undefined;

      const result = await adapter.getActionSpace(mockPage);

      expect(result).toEqual(mockActions);
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

  describe('runConnectivityTest', () => {
    it('should use current default model config and delegate to core', async () => {
      const modelConfig = { modelName: 'test-model' } as any;
      const planningModelConfig = {
        modelName: 'test-planning-model',
        intent: 'planning',
      } as any;
      const insightModelConfig = {
        modelName: 'test-insight-model',
        intent: 'insight',
      } as any;
      const result = {
        passed: true,
        checks: [],
      };

      rs.mocked(globalModelConfigManager.getModelConfig)
        .mockReturnValueOnce(modelConfig)
        .mockReturnValueOnce(planningModelConfig)
        .mockReturnValueOnce(insightModelConfig);
      rs.mocked(runConnectivityTest).mockResolvedValue(result);

      await expect(adapter.runConnectivityTest()).resolves.toEqual(result);
      expect(globalModelConfigManager.getModelConfig).toHaveBeenCalledWith(
        'default',
      );
      expect(globalModelConfigManager.getModelConfig).toHaveBeenCalledWith(
        'planning',
      );
      expect(globalModelConfigManager.getModelConfig).toHaveBeenCalledWith(
        'insight',
      );
      expect(runConnectivityTest).toHaveBeenCalledWith({
        defaultModelConfig: modelConfig,
        planningModelConfig,
        insightModelConfig,
      });
    });
  });

  describe('executeAction', () => {
    beforeEach(() => {
      rs.mocked(common.executeAction).mockResolvedValue('test result');
    });

    it('should execute action with agent and actionSpace', async () => {
      const mockActionSpace: DeviceAction<unknown>[] = [
        { name: 'click', description: 'Click action', call: rs.fn() },
      ];
      rs.mocked(mockAgent.getActionSpace!).mockResolvedValue(mockActionSpace);

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = {};

      const result = await adapter.executeAction('click', value, options);

      expect(result).toEqual({
        result: 'test result',
        dump: expect.any(ReportActionDump),
        reportHTML: null,
        error: null,
      });
      expect(common.executeAction).toHaveBeenCalledWith(
        mockAgent,
        'click',
        mockActionSpace,
        value,
        options,
      );
    });

    it('should use empty actionSpace when agent has no getActionSpace', async () => {
      const agentWithoutActionSpace = {
        dumpDataString: () => '{}',
        reportHTMLString: () => '',
        writeOutActionDumps: () => {},
        resetDump: () => {},
      } as unknown as PlaygroundAgent;
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
      rs.mocked(mockAgent.getActionSpace!).mockResolvedValue(mockActionSpace);

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = { requestId: 'request-123' };

      await adapter.executeAction('click', value, options);

      expect(mockAgent.onTaskStartTip).toBeDefined();
    });
  });

  describe('cancelTask', () => {
    it('should destroy agent successfully', async () => {
      rs.mocked(mockAgent.destroy!).mockResolvedValue(undefined);

      const result = await adapter.cancelTask('request-123');

      expect(result).toEqual({
        success: true,
        dump: expect.any(ReportActionDump),
        reportHTML: null,
      });
      expect(mockAgent.destroy).toHaveBeenCalled();
    });

    it('should return error when no agent', async () => {
      const adapterNoAgent = new LocalExecutionAdapter(
        {} as unknown as PlaygroundAgent,
      );
      (adapterNoAgent as any).agent = null;

      const result = await adapterNoAgent.cancelTask('request-123');

      expect(result).toEqual({
        error: 'No active agent found for this requestId',
      });
    });

    it('should handle destroy error', async () => {
      const destroyError = new Error('Destroy failed');
      rs.mocked(mockAgent.destroy!).mockRejectedValue(destroyError);

      const consoleSpy = rs
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await adapter.cancelTask('request-123');

      expect(result).toEqual({
        error: 'Failed to cancel: Destroy failed',
        dump: expect.any(ReportActionDump),
        reportHTML: null,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalExecutionAdapter] Failed to cancel agent: Destroy failed',
      );

      consoleSpy.mockRestore();
    });
  });
});
