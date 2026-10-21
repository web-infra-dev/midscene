import { fileURLToPath } from 'node:url';
import { HarmonyAgent, agentFromHdcDevice } from '@midscene/harmony';
import { type NodeExecutionContext, defineNode, z } from '@midscene/test';
import { defineFileSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface FileContext {
  agent: HarmonyAgent;
}

const getAgent = ({ context }: NodeExecutionContext<unknown, FileContext>) => {
  return context.agent;
};

const fileSetup = defineFileSetup<FileContext, undefined>({
  name: 'harmony',
  async setup({ env, onTeardown }) {
    const agent = await agentFromHdcDevice(env.HARMONY_DEVICE_ID || undefined);
    onTeardown(() => agent.destroy());
    return { agent };
  },
});

const todoSetupInputSchema = z.strictObject({});
const todoSetup = defineNode<typeof todoSetupInputSchema, void, FileContext>({
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
});

export default defineTestProject<FileContext, undefined>({
  projects: [
    {
      name: 'harmony',
      fileSetup,
      maxConcurrentFiles: 1,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    todoSetup,
    ...createMidsceneNodes<FileContext>({
      agentClass: HarmonyAgent,
      getAgent,
    }),
  ],
  test: { maxConcurrentFiles: 1, bail: 1, testTimeout: 720_000 },
});
