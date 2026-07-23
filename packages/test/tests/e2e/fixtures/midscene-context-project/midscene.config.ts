import { appendFileSync } from 'node:fs';
import { defineNode } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';

const log = (value) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

log(`config:${process.pid}`);

const documentLifecycle = defineNode({
  name: 'document.lifecycle',
  execute({ document, context }) {
    log(`${document.phase}:${context.id}:${process.pid}`);
  },
});

const startAttempt = defineNode({
  name: 'attempt.start',
  execute({ context, case: caseContext }) {
    context.attempt += 1;
    log(
      `beforeEach:${context.id}:${context.attempt}:${caseContext.runId}:${process.pid}`,
    );
  },
});

const midsceneNodes = createMidsceneNodes({
  getAgent: ({ context }) => context.uiAgent,
});
export default defineTestProject({
  nodes: [documentLifecycle, startAttempt, ...midsceneNodes],
  setup: {
    name: 'fixture',
    platform: 'web',
    async setup({ onTeardown }) {
      const context = { id: 1, attempt: 0 };
      log(`projectSetup:${context.id}:${process.pid}`);

      context.uiAgent = {
        async recordToReport(title, options) {
          log(
            `record:${context.id}:${context.attempt}:${title}:${options.content}:${process.pid}`,
          );
          if (
            process.env.WORKFLOW_E2E_FAIL_FIRST === '1' &&
            context.attempt === 1 &&
            title === 'Ready'
          ) {
            throw new Error('controlled first-attempt failure');
          }
        },
      };

      onTeardown(() => {
        log(`projectTeardown:${context.id}:${context.attempt}:${process.pid}`);
      });
      return context;
    },
  },
});
