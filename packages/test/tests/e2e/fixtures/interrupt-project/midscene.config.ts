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
