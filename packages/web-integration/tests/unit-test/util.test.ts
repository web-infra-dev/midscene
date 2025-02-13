import { getKeyCommands } from '@/common/ui-utils';
import { getCurrentExecutionFile } from '@/common/utils';
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
