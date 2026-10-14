import { fileURLToPath } from 'node:url';
import { AndroidAgent, agentFromAdbDevice } from '@midscene/android';
import { type NodeExecutionContext, defineNode, z } from '@midscene/test';
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

const todoSetupInputSchema = z.strictObject({});
const todoSetup = defineNode<typeof todoSetupInputSchema, void, ProjectContext>(
  {
    name: 'todo.setup',
    title: 'Prepare TodoMVC for the initial-state check',
    description:
      'Open React TodoMVC in All view and wait for its input without changing existing tasks.',
    inputSchema: todoSetupInputSchema,
    async execute({ context, signal }) {
      signal.throwIfAborted();
      await context.agent.launch('https://todomvc.com/examples/react/dist/#/');
      await context.agent.aiWaitFor(
        'The React TodoMVC page has loaded and the "What needs to be done?" input is visible.',
        { timeoutMs: 30_000, abortSignal: signal },
      );
      signal.throwIfAborted();
      return {
        summary:
          'Opened TodoMVC in All view; existing tasks were left unchanged.',
      };
    },
  },
);

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'android',
      setup,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    todoSetup,
    ...createMidsceneNodes<ProjectContext>({
      agentClass: AndroidAgent,
      getAgent,
    }),
  ],
  test: { maxConcurrency: 1, bail: 1, testTimeout: 720_000 },
});
