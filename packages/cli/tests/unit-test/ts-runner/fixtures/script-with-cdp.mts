/// <reference path="../../../../src/ts-runner/global.d.ts" />

export const cdp = 'ws://localhost:9222/devtools/browser/abc123';

export async function run(agent: any) {
  // Test function that does nothing
  return 'test completed with cdp';
}
