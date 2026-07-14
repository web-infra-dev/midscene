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
      execute(ctx) {
        log(ctx.input.value);
        return { data: { value: ctx.input.value } };
      },
    }),
    defineNode({
      name: 'test.expect-history',
      execute(ctx) {
        if (ctx.case.completedSteps.length !== ctx.input.count) {
          throw new Error(
            `Expected ${ctx.input.count} completed steps, received ${ctx.case.completedSteps.length}`,
          );
        }
      },
    }),
  ],
});
