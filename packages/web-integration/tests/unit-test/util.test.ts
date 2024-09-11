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
