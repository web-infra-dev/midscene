import { appendFileSync } from 'node:fs';
import { defineNode } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';

const log = (value) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

export default defineTestProject({
  nodes: [
    defineNode({
      name: 'before.fail',
      execute() {
        log('beforeAll');
        throw new Error('controlled beforeAll failure');
      },
    }),
    defineNode({
      name: 'after.record',
      execute() {
        log('afterAll');
      },
    }),
    defineNode({
      name: 'body.record',
      execute() {
        log('steps');
      },
    }),
  ],
  setupDocument({ onTeardown }) {
    log('setupDocument');
    onTeardown(() => log('documentTeardown'));
  },
});
