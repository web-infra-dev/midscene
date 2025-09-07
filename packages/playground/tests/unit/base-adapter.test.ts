import type { DeviceAction } from '@midscene/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasePlaygroundAdapter } from '../../src/adapters/base';
import type { FormValue } from '../../src/types';

class TestAdapter extends BasePlaygroundAdapter {
  async parseStructuredParams(): Promise<unknown[]> {
    return [];
  }

  formatErrorMessage(error: any): string {
    return this.formatBasicErrorMessage(error);
  }

  async executeAction(): Promise<unknown> {
    return 'test result';
  }
}

describe('BasePlaygroundAdapter', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
  });

  describe('getActionSpace', () => {
    it('should return empty array by default', async () => {
      const result = await adapter.getActionSpace({});
      expect(result).toEqual([]);
    });
  });

  describe('validateParams', () => {
    it('should return valid when no paramSchema exists', () => {
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        call: vi.fn(),
      };
      const value: FormValue = { type: 'test', params: { test: 'value' } };

      const result = adapter.validateParams(value, action);
      expect(result.valid).toBe(true);
    });

    it('should return valid when action needs no structured params', () => {
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: { shape: {} } as any,
        call: vi.fn(),
      };
      const value: FormValue = { type: 'test', params: { test: 'value' } };

      const result = adapter.validateParams(value, action);
      expect(result.valid).toBe(true);
    });

    it('should return invalid when params are required but missing', () => {
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: {
          shape: { requiredField: {} },
          parse: vi.fn(),
        } as any,
        call: vi.fn(),
      };
      const value: FormValue = { type: 'test' }; // No params

      const result = adapter.validateParams(value, action);
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('Parameters are required');
    });

    it('should validate successfully with valid params', () => {
      const mockParse = vi.fn();
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: {
          shape: { field: {} },
          parse: mockParse,
        } as any,
        call: vi.fn(),
      };
      const value: FormValue = {
        type: 'test',
        params: { field: 'value' },
      };

      const result = adapter.validateParams(value, action);
      expect(result.valid).toBe(true);
      expect(mockParse).toHaveBeenCalled();
    });

    it('should handle validation errors', () => {
      const mockParse = vi.fn(() => {
        const error = new Error('Validation failed');
        (error as any).errors = [{ path: ['field'], message: 'Required' }];
        throw error;
      });

      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: {
          shape: { field: {} },
          parse: mockParse,
        } as any,
        call: vi.fn(),
      };
      const value: FormValue = {
        type: 'test',
        params: { field: '' },
      };

      const result = adapter.validateParams(value, action);
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toContain('field: Required');
    });
  });

  describe('createDisplayContent', () => {
    it('should return prompt when no structured params needed', () => {
      const value: FormValue = {
        type: 'test',
        prompt: 'test prompt',
      };

      const result = adapter.createDisplayContent(value, false, undefined);
      expect(result).toBe('test prompt');
    });

    it('should return prompt when no params exist', () => {
      const value: FormValue = {
        type: 'test',
        prompt: 'test prompt',
      };
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: { shape: { field: {} } } as any,
        call: vi.fn(),
      };

      const result = adapter.createDisplayContent(value, true, action);
      expect(result).toBe('test prompt');
    });

    it('should build params display list when structured params exist', () => {
      const value: FormValue = {
        type: 'test',
        params: {
          textField: 'test value',
          numberField: 42,
        },
      };
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: {
          shape: {
            textField: {},
            numberField: {},
          },
        } as any,
        call: vi.fn(),
      };

      const result = adapter.createDisplayContent(value, true, action);
      expect(result).toContain('TextField: "test value"');
      expect(result).toContain('NumberField: 42');
    });
  });

  describe('helper methods', () => {
    describe('formatBasicErrorMessage', () => {
      it('should return error message', () => {
        const error = { message: 'test error' };
        const result = adapter.formatErrorMessage(error);
        expect(result).toBe('test error');
      });

      it('should return default message for no error', () => {
        const result = adapter.formatErrorMessage({});
        expect(result).toBe('Unknown error');
      });
    });

    describe('getSchemaKeys', () => {
      it('should return empty array when no schema', () => {
        const action: DeviceAction<unknown> = {
          name: 'test',
          description: 'Test action',
          call: vi.fn(),
        };
        const result = (adapter as any).getSchemaKeys(action);
        expect(result).toEqual([]);
      });

      it('should return schema keys', () => {
        const action: DeviceAction<unknown> = {
          name: 'test',
          description: 'Test action',
          paramSchema: {
            shape: {
              field1: {},
              field2: {},
            },
          } as any,
          call: vi.fn(),
        };
        const result = (adapter as any).getSchemaKeys(action);
        expect(result).toEqual(['field1', 'field2']);
      });
    });

    describe('filterValidParams', () => {
      it('should filter out invalid values', () => {
        const params = {
          valid: 'test',
          empty: '',
          null: null,
          undefined: undefined,
          zero: 0,
        };

        const result = (adapter as any).filterValidParams(params);
        expect(result).toEqual({
          valid: 'test',
          zero: 0,
        });
      });

      it('should exclude specified keys', () => {
        const params = {
          include: 'test',
          exclude: 'value',
        };

        const result = (adapter as any).filterValidParams(params, ['exclude']);
        expect(result).toEqual({
          include: 'test',
        });
      });
    });

    describe('actionNeedsStructuredParams', () => {
      it('should return false when no paramSchema', () => {
        const action: DeviceAction<unknown> = {
          name: 'test',
          description: 'Test action',
          call: vi.fn(),
        };
        const result = (adapter as any).actionNeedsStructuredParams(action);
        expect(result).toBe(true); // Default behavior
      });

      it('should return false when empty shape', () => {
        const action: DeviceAction<unknown> = {
          name: 'test',
          description: 'Test action',
          paramSchema: { shape: {} } as any,
          call: vi.fn(),
        };
        const result = (adapter as any).actionNeedsStructuredParams(action);
        expect(result).toBe(false);
      });

      it('should return true when shape has fields', () => {
        const action: DeviceAction<unknown> = {
          name: 'test',
          description: 'Test action',
          paramSchema: { shape: { field: {} } } as any,
          call: vi.fn(),
        };
        const result = (adapter as any).actionNeedsStructuredParams(action);
        expect(result).toBe(true);
      });
    });

    describe('capitalizeFirstLetter', () => {
      it('should capitalize first letter', () => {
        const result = (adapter as any).capitalizeFirstLetter('testField');
        expect(result).toBe('TestField');
      });

      it('should handle empty string', () => {
        const result = (adapter as any).capitalizeFirstLetter('');
        expect(result).toBe('');
      });
    });

    describe('formatParamValue', () => {
      it('should format string values with quotes', () => {
        const result = (adapter as any).formatParamValue(
          'field',
          'test',
          false,
        );
        expect(result).toBe('"test"');
      });

      it('should format locate field values with quotes', () => {
        const result = (adapter as any).formatParamValue(
          'field',
          'locate',
          true,
        );
        expect(result).toBe('"locate"');
      });

      it('should format numbers without quotes', () => {
        const result = (adapter as any).formatParamValue('field', 42, false);
        expect(result).toBe('42');
      });

      it('should format distance numbers with px', () => {
        const result = (adapter as any).formatParamValue(
          'distance',
          100,
          false,
        );
        expect(result).toBe('100px');
      });

      it('should format other types as string', () => {
        const result = (adapter as any).formatParamValue('field', true, false);
        expect(result).toBe('true');
      });
    });

    describe('isValidParamValue', () => {
      it('should return true for valid values', () => {
        expect((adapter as any).isValidParamValue('test')).toBe(true);
        expect((adapter as any).isValidParamValue(42)).toBe(true);
        expect((adapter as any).isValidParamValue(0)).toBe(true);
        expect((adapter as any).isValidParamValue(false)).toBe(true);
      });

      it('should return false for invalid values', () => {
        expect((adapter as any).isValidParamValue(undefined)).toBe(false);
        expect((adapter as any).isValidParamValue(null)).toBe(false);
        expect((adapter as any).isValidParamValue('')).toBe(false);
      });
    });
  });
});
