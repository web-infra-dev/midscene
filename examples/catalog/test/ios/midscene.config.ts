import { fileURLToPath } from 'node:url';
import { IOSAgent } from '@midscene/ios';
import { createWdaIOSSetup } from '@midscene/ios/test';
import { type NodeExecutionContext, defineNode, z } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface FileContext {
  agent: IOSAgent;
}

const getAgent = ({ context }: NodeExecutionContext<unknown, FileContext>) => {
  return context.agent;
};

const fileSetup = createWdaIOSSetup();

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
      name: 'ios',
      fileSetup,
      maxConcurrentFiles: 1,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    todoSetup,
    ...createMidsceneNodes<FileContext>({ agentClass: IOSAgent, getAgent }),
  ],
  test: { maxConcurrentFiles: 1, bail: 1, testTimeout: 720_000 },
});
