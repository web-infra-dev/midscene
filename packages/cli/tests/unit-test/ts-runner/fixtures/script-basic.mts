/// <reference path="../../../../src/ts-runner/global.d.ts" />

export async function run() {
  // Agent is already initialized by runner based on CLI args
  console.log('✓ Agent initialized:', !!agent);
  console.log('✓ Page URL:', await agent.page.url());
  console.log('✓ Page title:', await agent.page.title());

  // Simple test without AI calls
  const bodyHandle = await agent.page.$('body');
  console.log('✓ Body element found:', !!bodyHandle);

  return 'test completed';
}
