import { appendFileSync } from 'node:fs';
import { defineNode, z } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';

const log = (value: string) => {
  const path = process.env.WORKFLOW_E2E_LOG;
  if (!path) throw new Error('WORKFLOW_E2E_LOG is required');
  appendFileSync(path, `${value}\n`);
};

export default defineTestProject({
  projects: [
    {
      name: 'web',
      platform: 'web',
      files: { include: ['flows/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    defineNode({
      name: 'test.record',
      description: 'Append a value to the test execution log.',
      inputSchema: z.strictObject({
        value: z.string().describe('The value appended to the log.'),
      }),
      execute(ctx) {
        log(ctx.input.value);
        return { data: { value: ctx.input.value } };
      },
    }),
  ],
});
