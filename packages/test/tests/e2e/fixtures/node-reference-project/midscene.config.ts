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
        throw new Error('describe-nodes must not execute Node handlers.');
      },
    }),
  ],
  setupDocument() {
    throw new Error('describe-nodes must not run setupDocument.');
  },
});
