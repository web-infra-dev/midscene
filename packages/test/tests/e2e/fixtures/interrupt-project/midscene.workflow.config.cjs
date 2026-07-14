const { appendFileSync } = require('node:fs');
const { defineNode } = require('@midscene/test');
const { defineWorkflowProject } = require('@midscene/test/config');

const log = (value) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

module.exports = defineWorkflowProject({
  nodes: [
    defineNode({
      name: 'test.interrupt',
      execute() {
        log('interrupt');
        process.emit('SIGTERM');
      },
    }),
    defineNode({
      name: 'test.record',
      execute({ input }) {
        log(input.value);
      },
    }),
  ],
  setupDocument({ sourcePath, onTeardown }) {
    log(`setup:${sourcePath}`);
    onTeardown(() => log(`teardown:${sourcePath}`));
  },
});
