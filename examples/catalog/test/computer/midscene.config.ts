import { fileURLToPath } from 'node:url';
import { ComputerAgent, agentForComputer } from '@midscene/computer';
import type { NodeExecutionContext } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface ProjectContext {
  agent: ComputerAgent;
}

const getAgent = ({
  context,
}: NodeExecutionContext<unknown, ProjectContext>) => {
  return context.agent;
};

const setup = defineProjectSetup<ProjectContext>({
  name: 'computer',
  async setup({ env, onTeardown }) {
    const agent = await agentForComputer({
      displayId: env.COMPUTER_DISPLAY_ID || undefined,
    });
    onTeardown(() => agent.destroy());
    return { agent };
  },
});

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'computer',
      setup,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    ...createMidsceneNodes<ProjectContext>({
      agentClass: ComputerAgent,
      getAgent,
    }),
  ],
  test: { testTimeout: 360_000 },
});
