/// <reference path="../../../../src/ts-runner/global.d.ts" />

export const launch = {
  headed: false,
  url: 'https://example.com',
};

export async function run(agent: any) {
  // Test function that does nothing
  return 'test completed';
}
