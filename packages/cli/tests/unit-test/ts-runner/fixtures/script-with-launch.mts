/// <reference path="../../../../src/ts-runner/global.d.ts" />

export async function run() {
  // Call launch using global agent
  await agent.launch({
    headed: false,
    url: 'https://example.com',
  });
  return 'test completed';
}
