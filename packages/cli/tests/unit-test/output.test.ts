import { type CommandResult, printResult } from '@/output';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('output', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('printResult', () => {
    const successResult: CommandResult = {
      success: true,
      message: 'Action performed',
      screenshot: '/tmp/screenshot.png',
    };

    const errorResult: CommandResult = {
      success: false,
      error: 'Something went wrong',
    };

    const queryResult: CommandResult = {
      success: true,
      message: 'Query completed',
      result: { title: 'Hello World', items: [1, 2, 3] },
    };

    test('should output single-line JSON when json=true', () => {
      printResult(successResult, true);
      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(successResult));
    });

    test('should output pretty-printed JSON when json=false', () => {
      printResult(successResult, false);
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(successResult, null, 2),
      );
    });

    test('should output error result as single-line JSON', () => {
      printResult(errorResult, true);
      const output = consoleSpy.mock.calls[0][0];
      expect(output).not.toContain('\n');
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Something went wrong');
    });

    test('should output error result as pretty JSON', () => {
      printResult(errorResult, false);
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('\n');
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
    });

    test('should preserve complex result data in json mode', () => {
      printResult(queryResult, true);
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.result).toEqual({ title: 'Hello World', items: [1, 2, 3] });
    });

    test('should handle result with all fields', () => {
      const full: CommandResult = {
        success: true,
        message: 'ok',
        result: 42,
        screenshot: '/path',
        error: undefined,
      };
      printResult(full, true);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBe(42);
      expect(parsed.screenshot).toBe('/path');
    });
  });
});
