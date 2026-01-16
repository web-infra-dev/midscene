/// <reference path="../../../../src/ts-runner/global.d.ts" />

export async function run() {
  // Agent is already initialized by runner based on CLI args
  // Just verify agent exists and call a mock method
  console.log('✓ Agent initialized:', !!agent);

  // This will be mocked in tests
  await agent.aiAct('test action');

  return 'test completed';
}
