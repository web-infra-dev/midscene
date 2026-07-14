const { appendFileSync } = require('node:fs');
const { defineDocumentNode, defineNode } = require('@midscene/workflow');
const { defineWorkflowProject } = require('@midscene/workflow/config');
const { createMidsceneNodes } = require('@midscene/workflow/midscene');

const log = (value) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

const documentLifecycle = defineDocumentNode({
  name: 'document.lifecycle',
  execute({ document, context }) {
    log(`${document.phase}:${context.id}`);
  },
});

const startAttempt = defineNode({
  name: 'attempt.start',
  execute({ context, workflow }) {
    context.attempt += 1;
    log(`beforeEach:${context.id}:${context.attempt}:${workflow.runId}`);
  },
});

const midsceneNodes = createMidsceneNodes({
  getAgent: ({ context }) => context.uiAgent,
});
let documentCount = 0;

module.exports = defineWorkflowProject({
  documentNodes: [documentLifecycle],
  nodes: [startAttempt, ...midsceneNodes],

  async setupDocument({ sourcePath, onTeardown }) {
    documentCount += 1;
    const context = { id: documentCount, attempt: 0 };
    log(`setupDocument:${context.id}:${sourcePath}`);

    context.uiAgent = {
      async recordToReport(title, options) {
        log(
          `record:${context.id}:${context.attempt}:${title}:${options.content}`,
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
      log(`documentTeardown:${context.id}:${context.attempt}`);
    });
    return context;
  },
});
