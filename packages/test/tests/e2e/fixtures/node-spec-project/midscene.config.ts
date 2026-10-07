import { defineNode, z } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';

export default defineTestProject({
  nodes: [
    defineNode({
      name: 'order.create',
      title: 'Create order',
      description: 'Create an order in the test environment.',
      inputSchema: z.strictObject({
        sku: z.string().min(1).describe('The product SKU.'),
        quantity: z
          .number()
          .int()
          .positive()
          .describe('The quantity to order.'),
      }),
      execute() {
        throw new Error('nodes must not execute Node handlers.');
      },
    }),
  ],
  setup: {
    name: 'must-not-run',
    setup() {
      throw new Error('nodes must not run Project setup.');
    },
  },
});
