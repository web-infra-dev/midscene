import { getKeyCommands } from '@/common/ui-utils';
import { getCurrentExecutionFile, replaceIllegalPathCharsAndSpace } from '@/common/utils';
import { beforeEach, describe, expect, it } from 'vitest';

describe('TaskCache', () => {
  it('should return the current execution file', () => {
    const currentExecutionFile = getCurrentExecutionFile();
    expect(currentExecutionFile).toBe('/tests/unit-test/util.test.ts');
  });

  it('should return false if trace is not a valid file', () => {
    const trace =
      'at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1138:15)';
    const currentExecutionFile = getCurrentExecutionFile(trace);
    expect(currentExecutionFile).toBe(false);
  });

  it('extract trace from puppeteer', () => {
    const trace = `
        at getCurrentExecutionFile (/Users/user/workspace/midscene-example/puppeteer-demo/node_modules/@midscene/web/dist/es/puppeteer.js:561:11)
    at generateCacheId (/Users/user/workspace/midscene-example/puppeteer-demo/node_modules/@midscene/web/dist/es/puppeteer.js:568:32)
    at TaskCache (/Users/user/workspace/midscene-example/puppeteer-demo/node_modules/@midscene/web/dist/es/puppeteer.js:590:24)
    at PageTaskExecutor (/Users/user/workspace/midscene-example/puppeteer-demo/node_modules/@midscene/web/dist/es/puppeteer.js:711:26)
    at PageAgent (/Users/user/workspace/midscene-example/puppeteer-demo/node_modules/@midscene/web/dist/es/puppeteer.js:1147:29)
    at PuppeteerAgent (/Users/user/workspace/midscene-example/puppeteer-demo/node_modules/@midscene/web/dist/es/puppeteer.js:1352:9)
    at <anonymous> (/Users/user/workspace/midscene-example/puppeteer-demo/demo.ts:24:17)
    `;
    const currentExecutionFile = getCurrentExecutionFile(trace);
    expect(currentExecutionFile).toBe(false);
  });
});

describe('getKeyCommands', () => {
  it('should return a single key without command when no meta or control key is provided', () => {
    const result = getKeyCommands('a');
    expect(result).toEqual([{ key: 'a' }]);
  });

  it('should work with array input without meta key', () => {
    const result = getKeyCommands(['b', 'd']);
    expect(result).toEqual([{ key: 'b' }, { key: 'd' }]);
  });

  it('should attach "SelectAll" command when "Meta" is present with key "a"', () => {
    const result = getKeyCommands(['Meta', 'a', 'b']);
    expect(result).toEqual([
      { key: 'Meta' },
      { key: 'a', command: 'SelectAll' },
      { key: 'b' },
    ]);
  });

  it('should attach "Copy" command when "Control" is present with key "c"', () => {
    const result = getKeyCommands(['Control', 'c', 'x']);
    expect(result).toEqual([
      { key: 'Control' },
      { key: 'c', command: 'Copy' },
      { key: 'x' },
    ]);
  });

  it('should attach proper commands for uppercase letters when "Meta" is present', () => {
    const result = getKeyCommands(['Meta', 'A', 'C', 'V']);
    expect(result).toEqual([
      { key: 'Meta' },
      { key: 'A', command: 'SelectAll' },
      { key: 'C', command: 'Copy' },
      { key: 'V', command: 'Paste' },
    ]);
  });
});

describe('replaceIllegalPathCharsAndSpace', () => {
  it('should preserve Unix path separators', () => {
    const input = '/path/to/file.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/path/to/file.txt');
  });

  it('should preserve Windows backslash separators but replace colon', () => {
    const input = 'C:\\Users\\Documents\\file.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('C-\\Users\\Documents\\file.txt');
  });

  it('should replace illegal filename characters with dashes', () => {
    const input = 'file:name*with?illegal"chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('file-name-with-illegal-chars---.txt');
  });

  it('should replace spaces with dashes', () => {
    const input = 'file name with spaces.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('file-name-with-spaces.txt');
  });

  it('should handle mixed path and illegal characters', () => {
    const input = '/path/to/file:with*illegal?chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/path/to/file-with-illegal-chars---.txt');
  });

  it('should handle Windows path with illegal characters', () => {
    const input = 'C:\\Users\\Documents\\file:name*with?illegal"chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('C-\\Users\\Documents\\file-name-with-illegal-chars---.txt');
  });

  it('should handle empty string', () => {
    const input = '';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('');
  });

  it('should handle string with only illegal characters', () => {
    const input = ':*?"<>| ';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('--------');
  });

  it('should handle string with only path separators', () => {
    const input = '/\\//\\';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/\\//\\');
  });

  it('should handle complex real-world scenario', () => {
    const input = '/Users/test/Documents/My Project: "Important File" <2024>|backup*.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/Users/test/Documents/My-Project---Important-File---2024--backup-.txt');
  });

  it('should handle task title with illegal characters', () => {
    const input = 'Task: "Test File" <Important>|Special*';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('Task---Test-File---Important--Special-');
  });

  it('should handle cache ID with mixed characters', () => {
    const input = 'cache-id:with*special?chars"and<spaces>|';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('cache-id-with-special-chars-and-spaces--');
  });
});
