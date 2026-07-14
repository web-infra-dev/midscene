const { appendFileSync } = require('node:fs');
const { defineWorkflowProject } = require('@midscene/workflow/config');
const { createMidsceneNodes } = require('@midscene/workflow/midscene');

const log = (value) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

const midsceneNodes = createMidsceneNodes({
  getAgent: ({ context }) => context.uiAgent,
});
let setupCount = 0;

module.exports = defineWorkflowProject({
  nodes: midsceneNodes,

  async setupWorkflow({ name, onTeardown }) {
    setupCount += 1;
    const attempt = setupCount;
    log(`setup:${attempt}:${name}`);

    // A real project would create a Playwright, Puppeteer, or device Agent here.
    // recordToReport does not need a model, so this report-only Agent keeps the
    // e2e test deterministic while exercising the public integration contract.
    const uiAgent = {
      async recordToReport(title, options) {
        log(`record:${attempt}:${title}:${options.content}`);
        if (process.env.WORKFLOW_E2E_FAIL_FIRST === '1' && attempt === 1) {
          throw new Error('controlled first-attempt failure');
        }
      },
    };

    onTeardown(() => {
      log(`teardown:${attempt}:${name}`);
    });

    return { uiAgent };
  },
});
