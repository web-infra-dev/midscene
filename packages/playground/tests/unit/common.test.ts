import type { DeviceAction } from '@midscene/core';
import { describe, expect, it, vi } from 'vitest';
import {
  dataExtractionAPIs,
  executeAction,
  formatErrorMessage,
  noReplayAPIs,
  validateStructuredParams,
  validationAPIs,
} from '../../src/common';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
} from '../../src/types';

const createMockPlaygroundAgent = (
  partial: Partial<PlaygroundAgent> = {},
): PlaygroundAgent => partial as PlaygroundAgent;

describe('common utilities', () => {
  describe('API constants', () => {
    it('should have correct data extraction APIs', () => {
      expect(dataExtractionAPIs).toEqual([
        'aiQuery',
        'aiBoolean',
        'aiNumber',
        'aiString',
        'aiAsk',
      ]);
    });

    it('should have correct validation APIs', () => {
      expect(validationAPIs).toEqual(['aiAssert', 'aiWaitFor']);
    });

    it('should combine data extraction and validation APIs in noReplayAPIs', () => {
      expect(noReplayAPIs).toEqual([...dataExtractionAPIs, ...validationAPIs]);
    });
  });

  describe('formatErrorMessage', () => {
    it('should format extension conflict error', () => {
      const error = { message: 'Something of different extension' };
      const result = formatErrorMessage(error);
      expect(result).toContain('Conflicting extension detected');
      expect(result).toContain('midscenejs.com');
    });

    it('should format NOT_IMPLEMENTED_AS_DESIGNED error', () => {
      const error = { message: 'NOT_IMPLEMENTED_AS_DESIGNED error' };
      const result = formatErrorMessage(error);
      expect(result).toBe(
        'Further actions cannot be performed in the current environment',
      );
    });

    it('should return original error message for other errors', () => {
      const error = { message: 'Custom error message' };
      const result = formatErrorMessage(error);
      expect(result).toBe('Custom error message');
    });

    it('should handle errors without message', () => {
      const error = {};
      const result = formatErrorMessage(error);
      expect(result).toBe('Unknown error');
    });

    it('should handle null/undefined errors', () => {
      expect(formatErrorMessage(null)).toBe('Unknown error');
      expect(formatErrorMessage(undefined)).toBe('Unknown error');
    });
  });

  describe('validateStructuredParams', () => {
    it('should return invalid when params are missing', () => {
      const value: FormValue = { type: 'test' };
      const result = validateStructuredParams(value, undefined);

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('Parameters are required');
    });

    it('should return valid when no action schema exists', () => {
      const value: FormValue = {
        type: 'test',
        params: { prompt: 'test prompt' },
      };
      const action = undefined;

      const result = validateStructuredParams(value, action);
      expect(result.valid).toBe(true);
    });

    it('should return valid when action has no paramSchema', () => {
      const value: FormValue = {
        type: 'test',
        params: { prompt: 'test prompt' },
      };
      const action: DeviceAction<unknown> = {
        name: 'testAction',
        description: 'Test action',
        call: vi.fn(),
      };

      const result = validateStructuredParams(value, action);
      expect(result.valid).toBe(true);
    });

    it('should validate parameters with schema', () => {
      const mockParse = vi.fn();
      const value: FormValue = {
        type: 'test',
        params: { prompt: 'test prompt' },
      };
      const action: DeviceAction<unknown> = {
        name: 'testAction',
        description: 'Test action',
        paramSchema: { parse: mockParse } as any,
        call: vi.fn(),
      };

      const result = validateStructuredParams(value, action);
      expect(result.valid).toBe(true);
      expect(mockParse).toHaveBeenCalled();
    });

    it('should handle validation errors', () => {
      const mockParse = vi.fn(() => {
        const error = new Error('Validation failed');
        (error as any).errors = [
          { path: ['field'], message: 'Required field' },
        ];
        throw error;
      });

      const value: FormValue = {
        type: 'test',
        params: { prompt: 'test prompt' },
      };
      const action: DeviceAction<unknown> = {
        name: 'testAction',
        description: 'Test action',
        paramSchema: { parse: mockParse } as any,
        call: vi.fn(),
      };

      const result = validateStructuredParams(value, action);
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toContain('field: Required field');
    });
  });

  describe('executeAction', () => {
    it('should execute action through callActionInActionSpace when available', async () => {
      const mockCallAction = vi.fn().mockResolvedValue('action result');
      const activeAgent = createMockPlaygroundAgent({
        callActionInActionSpace: mockCallAction,
      });

      const action: DeviceAction<unknown> = {
        name: 'testAction',
        description: 'Test action',
        call: vi.fn(),
      };

      const actionSpace = [action];
      const value: FormValue = {
        type: 'testAction',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = {};

      const result = await executeAction(
        activeAgent,
        'testAction',
        actionSpace,
        value,
        options,
      );

      expect(result).toBe('action result');
      expect(mockCallAction).toHaveBeenCalledWith('testAction', {
        locate: {
          prompt: 'test prompt',
          deepLocate: false,
          cacheable: true,
          xpath: undefined,
        },
      });
    });

    it('should warn for non-aiAct deepThink without mutating params', async () => {
      // NOTE: This test documents intentional migration-period behavior.
      // deepThink in non-aiAct options triggers a warning but is NOT stripped,
      // because executeAction is a low-level utility that should not silently
      // mutate caller-provided options. The filtering responsibility belongs to
      // upstream callers (playground/report layer) before reaching this point.
      // TODO: Remove this test and the corresponding warning once migration is complete.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockCallAction = vi.fn().mockResolvedValue('action result');
      const activeAgent = createMockPlaygroundAgent({
        callActionInActionSpace: mockCallAction,
      });

      const action: DeviceAction<unknown> = {
        name: 'Tap',
        interfaceAlias: 'aiTap',
        description: 'Tap action',
        call: vi.fn(),
      };

      const value: FormValue = {
        type: 'aiTap',
        prompt: 'tap login button',
      };

      await executeAction(activeAgent, 'aiTap', [action], value, {
        deepLocate: false,
        deepThink: true,
        requestId: 'req-1',
      });

      const actionParams = mockCallAction.mock.calls[0][1];
      expect(actionParams.deepThink).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        '[Playground] Received deepThink in non-aiAct action options. deepThink is expected to be used with aiAct/runMarkdown during migration.',
        {
          actionType: 'aiTap',
          options: {
            deepLocate: false,
            deepThink: true,
            requestId: 'req-1',
          },
          requestId: 'req-1',
        },
      );

      warnSpy.mockRestore();
    });

    it('should not pass report display metadata to action-space actions', async () => {
      const mockCallAction = vi.fn().mockResolvedValue('action result');
      const activeAgent = createMockPlaygroundAgent({
        callActionInActionSpace: mockCallAction,
      });

      const action: DeviceAction<unknown> = {
        name: 'Tap',
        interfaceAlias: 'aiTap',
        description: 'Tap action',
        call: vi.fn(),
      };

      await executeAction(
        activeAgent,
        'aiTap',
        [action],
        {
          type: 'aiTap',
          prompt: 'tap login button',
        },
        {
          deepLocate: false,
          reportDisplay: {
            prompt: 'Recorder Markdown Replay: login flow',
          },
        },
      );

      expect(mockCallAction.mock.calls[0][1]).not.toHaveProperty(
        'reportDisplay',
      );
    });

    it('should keep deepThink for aiAct action without warning', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockCallAction = vi.fn().mockResolvedValue('action result');
      const activeAgent = createMockPlaygroundAgent({
        callActionInActionSpace: mockCallAction,
      });

      const action: DeviceAction<unknown> = {
        name: 'aiAction',
        interfaceAlias: 'aiAct',
        description: 'Plan action',
        call: vi.fn(),
      };

      const value: FormValue = {
        type: 'aiAct',
        prompt: 'do something',
      };

      await executeAction(activeAgent, 'aiAct', [action], value, {
        deepLocate: false,
        deepThink: true,
        requestId: 'req-2',
      });

      const actionParams = mockCallAction.mock.calls[0][1];
      expect(actionParams.deepThink).toBe(true);
      expect(warnSpy).not.toHaveBeenCalledWith(
        '[Playground] Received deepThink in non-aiAct action options. deepThink is expected to be used with aiAct/runMarkdown during migration.',
        expect.anything(),
      );

      warnSpy.mockRestore();
    });

    it('should keep deepThink for runMarkdown without warning', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockRunMarkdown = vi.fn().mockResolvedValue('markdown result');
      const activeAgent: PlaygroundAgent = {
        runMarkdown: mockRunMarkdown,
      } as unknown as PlaygroundAgent;

      const value: FormValue = {
        type: 'runMarkdown',
        prompt: '/tmp/recording.md',
      };

      const result = await executeAction(
        activeAgent,
        'runMarkdown',
        [],
        value,
        {
          deepLocate: false,
          deepThink: true,
          requestId: 'req-3',
        },
      );

      expect(result).toBe('markdown result');
      expect(mockRunMarkdown).toHaveBeenCalledWith('/tmp/recording.md', {
        deepLocate: false,
        deepThink: true,
        requestId: 'req-3',
      });
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should map report display metadata to aiAct internal report options', async () => {
      const mockAiAct = vi.fn().mockResolvedValue('aiAct result');
      const activeAgent = createMockPlaygroundAgent({
        aiAct: mockAiAct,
      });

      const result = await executeAction(
        activeAgent,
        'aiAct',
        [],
        {
          type: 'aiAct',
          prompt: 'Replay the following Midscene Studio recording...',
        },
        {
          deepLocate: true,
          requestId: 'req-replay',
          reportDisplay: {
            prompt: 'Recorder Markdown Replay: login flow',
          },
        },
      );

      expect(result).toBe('aiAct result');
      expect(mockAiAct).toHaveBeenCalledWith(
        'Replay the following Midscene Studio recording...',
        {
          deepLocate: true,
          requestId: 'req-replay',
          _internalReportDisplay: {
            prompt: 'Recorder Markdown Replay: login flow',
          },
        },
      );
    });

    it('should handle aiAssert action specially', async () => {
      const mockAiAssert = vi.fn().mockResolvedValue({
        pass: true,
        thought: 'test thought',
      });
      const activeAgent = createMockPlaygroundAgent({
        aiAssert: mockAiAssert,
      });

      const value: FormValue = {
        type: 'aiAssert',
        prompt: 'test assertion',
      };
      const options: ExecutionOptions = {};

      const result = await executeAction(
        activeAgent,
        'aiAssert',
        [],
        value,
        options,
      );

      expect(result).toEqual({ pass: true, thought: 'test thought' });
      expect(mockAiAssert).toHaveBeenCalledWith('test assertion', undefined, {
        keepRawResponse: true,
      });
    });

    it('should call allowlisted agent methods when action not found', async () => {
      const mockCustomAction = vi.fn().mockResolvedValue('custom result');
      const activeAgent = createMockPlaygroundAgent({
        aiString: mockCustomAction,
      });

      const value: FormValue = {
        type: 'aiString',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = {};

      const result = await executeAction(
        activeAgent,
        'aiString',
        [],
        value,
        options,
      );

      expect(result).toBe('custom result');
      expect(mockCustomAction).toHaveBeenCalledWith('test prompt', options);
    });

    it('should reject non-allowlisted agent methods when action not found', async () => {
      const mockCustomAction = vi.fn().mockResolvedValue('custom result');
      const activeAgent = createMockPlaygroundAgent({
        customAction: mockCustomAction,
      });

      await expect(
        executeAction(
          activeAgent,
          'customAction',
          [],
          {
            type: 'customAction',
            prompt: 'test prompt',
          },
          {},
        ),
      ).rejects.toThrow('Unknown action type: customAction');
      expect(mockCustomAction).not.toHaveBeenCalled();
    });

    it('should throw error for unknown action type', async () => {
      const activeAgent = createMockPlaygroundAgent();
      const value: FormValue = {
        type: 'unknownAction',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = {};

      await expect(
        executeAction(activeAgent, 'unknownAction', [], value, options),
      ).rejects.toThrow('Unknown action type: unknownAction');
    });

    it('should find action by interfaceAlias', async () => {
      const mockCallAction = vi.fn().mockResolvedValue('alias result');
      const activeAgent = createMockPlaygroundAgent({
        callActionInActionSpace: mockCallAction,
      });

      const action: DeviceAction<unknown> = {
        name: 'realName',
        interfaceAlias: 'aliasName',
        description: 'Test action',
        call: vi.fn(),
      };

      const actionSpace = [action];
      const value: FormValue = {
        type: 'aliasName',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = {};

      const result = await executeAction(
        activeAgent,
        'aliasName',
        actionSpace,
        value,
        options,
      );

      expect(result).toBe('alias result');
      expect(mockCallAction).toHaveBeenCalledWith('realName', {
        locate: {
          prompt: 'test prompt',
          deepLocate: false,
          cacheable: true,
          xpath: undefined,
        },
      });
    });
  });
});
