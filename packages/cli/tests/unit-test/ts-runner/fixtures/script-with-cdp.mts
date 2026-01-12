/// <reference path="../../../../src/ts-runner/global.d.ts" />

export async function run() {
  // Call connect using global agent
  await agent.connect('ws://localhost:9222/devtools/browser/abc123');
  return 'test completed with cdp';
}
