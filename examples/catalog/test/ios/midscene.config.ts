import { fileURLToPath } from 'node:url';
import { IOSAgent, agentFromWebDriverAgent } from '@midscene/ios';
import { type NodeExecutionContext, defineNode, z } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface ProjectContext {
  agent: IOSAgent;
}

const getAgent = ({
  context,
}: NodeExecutionContext<unknown, ProjectContext>) => {
  return context.agent;
};

const setup = defineProjectSetup<ProjectContext>({
  name: 'ios',
  async setup({ env, onTeardown }) {
    const wdaBaseUrl = env.WDA_BASE_URL || undefined;
    if (
      wdaBaseUrl &&
      (env.WDA_HOST !== undefined || env.WDA_PORT !== undefined)
    ) {
      throw new Error('WDA_BASE_URL cannot be used with WDA_HOST or WDA_PORT.');
    }
    const port = Number(env.WDA_PORT || 8100);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('WDA_PORT must be an integer between 1 and 65535.');
    }
    const wdaMjpegUrl = env.WDA_MJPEG_URL || undefined;
    if (wdaMjpegUrl && env.WDA_MJPEG_PORT !== undefined) {
      throw new Error('WDA_MJPEG_URL cannot be used with WDA_MJPEG_PORT.');
    }
    const mjpegPort =
      env.WDA_MJPEG_PORT === undefined ? undefined : Number(env.WDA_MJPEG_PORT);
    if (
      mjpegPort !== undefined &&
      (!Number.isInteger(mjpegPort) || mjpegPort < 1 || mjpegPort > 65535)
    ) {
      throw new Error('WDA_MJPEG_PORT must be an integer between 1 and 65535.');
    }
    const agent = await agentFromWebDriverAgent({
      ...(wdaBaseUrl
        ? { wdaBaseUrl }
        : { wdaHost: env.WDA_HOST || 'localhost', wdaPort: port }),
      ...(wdaMjpegUrl ? { wdaMjpegUrl } : {}),
      ...(mjpegPort !== undefined ? { wdaMjpegPort: mjpegPort } : {}),
    });
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
      name: 'ios',
      setup,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    todoSetup,
    ...createMidsceneNodes<ProjectContext>({ agentClass: IOSAgent, getAgent }),
  ],
  test: { maxConcurrency: 1, bail: 1, testTimeout: 720_000 },
});
