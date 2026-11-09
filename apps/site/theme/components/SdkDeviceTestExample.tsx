import { CodeBlockRuntime } from '@rspress/core/theme';

// Shared by both runners and both documentation languages.
const examples = {
  android: (runnerImport: string) => `import 'dotenv/config';
import { afterEach, beforeEach, test } from '${runnerImport}';
import { agentFromAdbDevice } from '@midscene/android';

let agent: Awaited<ReturnType<typeof agentFromAdbDevice>> | undefined;

beforeEach(async () => {
  agent = await agentFromAdbDevice();
});

afterEach(async () => {
  const currentAgent = agent;
  agent = undefined;
  await currentAgent?.destroy();
});

test('scroll through settings', async () => {
  if (!agent) throw new Error('Agent was not initialized');

  await agent.launch('com.android.settings');
  await agent.aiWaitFor('The Settings app is visible');
  await agent.aiAct('Scroll down one screen');
  await agent.aiAssert('The Settings app is still visible');
});`,
  ios: (runnerImport: string) => `import 'dotenv/config';
import { afterEach, beforeEach, test } from '${runnerImport}';
import { agentFromWebDriverAgent } from '@midscene/ios';

let agent: Awaited<ReturnType<typeof agentFromWebDriverAgent>> | undefined;

beforeEach(async () => {
  agent = await agentFromWebDriverAgent({
    wdaHost: 'localhost',
    wdaPort: 8100,
  });
});

afterEach(async () => {
  const currentAgent = agent;
  agent = undefined;
  await currentAgent?.destroy();
});

test('scroll through settings', async () => {
  if (!agent) throw new Error('Agent was not initialized');

  await agent.launch('com.apple.Preferences');
  await agent.aiWaitFor('The Settings app is visible');
  await agent.aiAct('Scroll down one screen');
  await agent.aiAssert('The Settings app is still visible');
});`,
  harmonyos: (runnerImport: string) => `import 'dotenv/config';
import { afterEach, beforeEach, test } from '${runnerImport}';
import { agentFromHdcDevice } from '@midscene/harmony';

let agent: Awaited<ReturnType<typeof agentFromHdcDevice>> | undefined;

beforeEach(async () => {
  agent = await agentFromHdcDevice();
});

afterEach(async () => {
  const currentAgent = agent;
  agent = undefined;
  await currentAgent?.destroy();
});

test('scroll through settings', async () => {
  if (!agent) throw new Error('Agent was not initialized');

  await agent.launch('com.huawei.hmos.settings');
  await agent.aiWaitFor('The Settings app is visible');
  await agent.aiAct('Scroll down one screen');
  await agent.aiAssert('The Settings app is still visible');
});`,
  desktop: (runnerImport: string) => `import 'dotenv/config';
import { afterEach, beforeEach, test } from '${runnerImport}';
import { agentForComputer } from '@midscene/computer';

let agent: Awaited<ReturnType<typeof agentForComputer>> | undefined;

beforeEach(async () => {
  agent = await agentForComputer();
});

afterEach(async () => {
  const currentAgent = agent;
  agent = undefined;
  await currentAgent?.destroy();
});

test('scroll through settings', async () => {
  if (!agent) throw new Error('Agent was not initialized');

  await agent.aiWaitFor('The Settings app is visible');
  await agent.aiAct('Scroll down one screen');
  await agent.aiAssert('The Settings app is still visible');
});`,
};

export function SdkDeviceTestExample({
  runner,
  platform,
}: {
  runner: 'vitest' | 'rstest';
  platform: keyof typeof examples;
}) {
  return (
    <CodeBlockRuntime
      lang="typescript"
      title="e2e/settings.test.ts"
      code={examples[platform](runner === 'rstest' ? '@rstest/core' : 'vitest')}
    />
  );
}
