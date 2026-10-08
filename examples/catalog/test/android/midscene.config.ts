import { fileURLToPath } from 'node:url';
import { AndroidAgent, agentFromAdbDevice } from '@midscene/android';
import type { NodeExecutionContext } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface ProjectContext {
  agent: AndroidAgent;
}

const getAgent = ({
  context,
}: NodeExecutionContext<unknown, ProjectContext>) => {
  return context.agent;
};

const setup = defineProjectSetup<ProjectContext>({
  name: 'android',
  async setup({ env, onTeardown }) {
    const agent = await agentFromAdbDevice(env.ANDROID_DEVICE_ID || undefined);
    onTeardown(() => agent.destroy());
    return { agent };
  },
});

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'android',
      setup,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    ...createMidsceneNodes<ProjectContext>({
      agentClass: AndroidAgent,
      getAgent,
    }),
  ],
  test: { testTimeout: 720_000 },
});
