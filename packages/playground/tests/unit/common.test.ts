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
      const activeAgent: PlaygroundAgent = {
        callActionInActionSpace: mockCallAction,
      };

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
          deepThink: false,
          cacheable: true,
          xpath: undefined,
        },
      });
    });

    it('should handle aiAssert action specially', async () => {
      const mockAiAssert = vi.fn().mockResolvedValue({
        pass: true,
        thought: 'test thought',
      });
      const activeAgent: PlaygroundAgent = {
        aiAssert: mockAiAssert,
      };

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

    it('should fallback to agent method when action not found', async () => {
      const mockCustomAction = vi.fn().mockResolvedValue('custom result');
      const activeAgent: PlaygroundAgent = {
        customAction: mockCustomAction,
      };

      const value: FormValue = {
        type: 'customAction',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = {};

      const result = await executeAction(
        activeAgent,
        'customAction',
        [],
        value,
        options,
      );

      expect(result).toBe('custom result');
      expect(mockCustomAction).toHaveBeenCalledWith('test prompt', options);
    });

    it('should throw error for unknown action type', async () => {
      const activeAgent: PlaygroundAgent = {};
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
      const activeAgent: PlaygroundAgent = {
        callActionInActionSpace: mockCallAction,
      };

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
          deepThink: false,
          cacheable: true,
          xpath: undefined,
        },
      });
    });
  });
});
