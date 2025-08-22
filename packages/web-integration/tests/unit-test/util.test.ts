import fs from 'node:fs';
import path from 'node:path';
import { getKeyCommands } from '@midscene/core/agent';
import {
  getCurrentExecutionFile,
  trimContextByViewport,
} from '@midscene/core/agent';
import {
  buildDetailedLocateParam,
  buildDetailedLocateParamAndRestParams,
} from '@midscene/core/yaml';
import { describe, expect, it } from 'vitest';

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

describe('trimContextByViewport', () => {
  it('should reserve the visible nodes of invisible elements', () => {
    const dumpPath = path.join(
      __dirname,
      'fixtures',
      'dump-with-invisible.json',
    );
    const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    const result = trimContextByViewport(dump.executions[0]);
    expect(result.tasks[0].pageContext?.tree?.node).toBeNull();
    expect(result.tasks[0].pageContext?.tree?.children.length).toBe(28);
  });
});

describe('buildDetailedLocateParam', () => {
  it('should build basic detailed locate param from string prompt', () => {
    const locatePrompt = 'Click on the login button';
    const result = buildDetailedLocateParam(locatePrompt);

    expect(result).toEqual({
      prompt: 'Click on the login button',
      deepThink: false,
      cacheable: true,
      xpath: undefined,
    });
  });

  it('should build detailed locate param with options', () => {
    const locatePrompt = 'Find the submit button';
    const options = {
      deepThink: true,
      cacheable: false,
      xpath: '//button[@type="submit"]',
      // prompt: 'Override prompt',
    };
    const result = buildDetailedLocateParam(locatePrompt, options);

    expect(result).toMatchInlineSnapshot(`
      {
        "cacheable": false,
        "deepThink": true,
        "prompt": "Find the submit button",
        "xpath": "//button[@type="submit"]",
      }
    `);
  });

  it('should handle partial options with defaults', () => {
    const locatePrompt = 'Locate the search input';
    const options = {
      deepThink: true,
      // cacheable and xpath not provided - should use defaults
    };
    const result = buildDetailedLocateParam(locatePrompt, options);

    expect(result).toEqual({
      prompt: 'Locate the search input',
      deepThink: true,
      cacheable: true, // default value
      xpath: undefined, // default value
    });
  });
});

describe('buildDetailedLocateParamAndRestParams', () => {
  it('should build detailed locate param and empty rest params when no extra options', () => {
    const locatePrompt = 'Click on the login button';
    const result = buildDetailedLocateParamAndRestParams(
      locatePrompt,
      undefined,
    );

    expect(result.locateParam).toEqual({
      prompt: 'Click on the login button',
      deepThink: false,
      cacheable: true,
      xpath: undefined,
    });
    expect(result.restParams).toEqual({});
  });

  it('should build detailed locate param and extract pageContext to restParams', () => {
    const locatePrompt = 'Find the submit button';
    const mockPageContext = {
      tree: { node: null, children: [] },
      size: { width: 800, height: 600 },
      screenshotBase64: 'mock-base64-string',
    };
    const options = {
      deepThink: true,
      cacheable: false,
      xpath: '//button[@type="submit"]',
      prompt: 'Override prompt',
      pageContext: mockPageContext,
    };
    const result = buildDetailedLocateParamAndRestParams(locatePrompt, options);

    expect(result.locateParam).toMatchInlineSnapshot(`
      {
        "cacheable": false,
        "deepThink": true,
        "prompt": "Find the submit button",
        "xpath": "//button[@type="submit"]",
      }
    `);
    expect(result.restParams).toEqual({
      pageContext: mockPageContext,
    });
  });

  it('should handle multiple rest params', () => {
    const locatePrompt = 'Locate the search input';
    const options = {
      deepThink: true,
      pageContext: {
        tree: { node: null, children: [] },
        size: { width: 1024, height: 768 },
        screenshotBase64: 'mock-base64-string',
      },
      customParam1: 'value1',
      customParam2: 42,
      customParam3: true,
    } as any; // Using 'as any' because these custom params aren't in LocateOption type
    const result = buildDetailedLocateParamAndRestParams(locatePrompt, options);

    expect(result.locateParam).toEqual({
      prompt: 'Locate the search input',
      deepThink: true,
      cacheable: true,
      xpath: undefined,
    });
    expect(result.restParams).toEqual({
      pageContext: {
        tree: { node: null, children: [] },
        size: { width: 1024, height: 768 },
        screenshotBase64: 'mock-base64-string',
      },
      customParam1: 'value1',
      customParam2: 42,
      customParam3: true,
    });
  });

  it('should handle null options', () => {
    const locatePrompt = 'Test prompt';
    const result = buildDetailedLocateParamAndRestParams(
      locatePrompt,
      null as any,
    );

    expect(result.locateParam).toEqual({
      prompt: 'Test prompt',
      deepThink: false,
      cacheable: true,
      xpath: undefined,
    });
    expect(result.restParams).toEqual({});
  });
});
