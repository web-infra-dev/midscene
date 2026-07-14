const { appendFileSync } = require('node:fs');
const { defineNode } = require('@midscene/workflow');
const { defineWorkflowProject } = require('@midscene/workflow/config');

const log = (value) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

module.exports = defineWorkflowProject({
  nodes: [
    defineNode({
      name: 'test.record',
      execute({ input }) {
        log(input.value);
        if (input.fail) throw new Error('controlled workflow failure');
      },
    }),
  ],
});
