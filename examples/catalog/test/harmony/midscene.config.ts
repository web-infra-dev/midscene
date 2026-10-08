import { fileURLToPath } from 'node:url';
import { HarmonyAgent, agentFromHdcDevice } from '@midscene/harmony';
import type { NodeExecutionContext } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface ProjectContext {
  agent: HarmonyAgent;
}

const getAgent = ({
  context,
}: NodeExecutionContext<unknown, ProjectContext>) => {
  return context.agent;
};

const setup = defineProjectSetup<ProjectContext>({
  name: 'harmony',
  async setup({ env, onTeardown }) {
    const agent = await agentFromHdcDevice(env.HARMONY_DEVICE_ID || undefined);
    onTeardown(() => agent.destroy());
    return { agent };
  },
});

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'harmony',
      setup,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    ...createMidsceneNodes<ProjectContext>({
      agentClass: HarmonyAgent,
      getAgent,
    }),
  ],
  test: { testTimeout: 720_000 },
});
