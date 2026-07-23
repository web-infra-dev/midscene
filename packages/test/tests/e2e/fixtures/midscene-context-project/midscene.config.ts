import { appendFileSync } from 'node:fs';
import { defineNode } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';
import {
  type MidsceneUIAgent,
  createMidsceneNodes,
} from '@midscene/test/midscene';

interface FixtureContext {
  id: number;
  attempt: number;
  uiAgent: MidsceneUIAgent;
}

const log = (value: string) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

log(`config:${process.pid}`);

const documentLifecycle = defineNode<unknown, unknown, FixtureContext>({
  name: 'document.lifecycle',
  execute(ctx) {
    if (ctx.scope !== 'document') {
      throw new Error('document.lifecycle only supports document hooks.');
    }
    log(`${ctx.document.phase}:${ctx.context.id}:${process.pid}`);
  },
});

const startAttempt = defineNode<unknown, unknown, FixtureContext>({
  name: 'attempt.start',
  execute(ctx) {
    if (ctx.scope !== 'case') {
      throw new Error('attempt.start only supports case hooks.');
    }
    ctx.context.attempt += 1;
    log(
      `beforeEach:${ctx.context.id}:${ctx.context.attempt}:${ctx.case.runId}:${process.pid}`,
    );
  },
});

const midsceneNodes = createMidsceneNodes<FixtureContext>({
  getAgent: ({ context }) => context.uiAgent,
});
export default defineTestProject<FixtureContext>({
  nodes: [documentLifecycle, startAttempt, ...midsceneNodes],
  setup: {
    name: 'fixture',
    platform: 'web',
    async setup({ onTeardown }) {
      const context: FixtureContext = {
        id: 1,
        attempt: 0,
        uiAgent: {
          async aiAct() {
            throw new Error('aiAct is not used by this fixture.');
          },
          async aiAssert() {
            throw new Error('aiAssert is not used by this fixture.');
          },
          async recordToReport(title, options) {
            log(
              `record:${context.id}:${context.attempt}:${title}:${options?.content}:${process.pid}`,
            );
            if (
              process.env.WORKFLOW_E2E_FAIL_FIRST === '1' &&
              context.attempt === 1 &&
              title === 'Ready'
            ) {
              throw new Error('controlled first-attempt failure');
            }
          },
        },
      };
      log(`projectSetup:${context.id}:${process.pid}`);

      onTeardown(() => {
        log(`projectTeardown:${context.id}:${context.attempt}:${process.pid}`);
      });
      return context;
    },
  },
});
