/// <reference path="../../../../src/ts-runner/global.d.ts" />

export async function run(agent: any) {
  // Call launch inside run function
  await agent.launch({
    headed: false,
    url: 'https://example.com',
  });
  return 'test completed';
}
