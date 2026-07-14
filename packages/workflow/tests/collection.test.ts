import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectWorkflowDocument,
  createWorkflowTestId,
  defineNode,
} from '../src';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const createDocument = (content: string) => {
  const directory = mkdtempSync(join(tmpdir(), 'midscene-workflow-'));
  directories.push(directory);
  const absolutePath = join(directory, 'orders.yaml');
  writeFileSync(absolutePath, content);
  return {
    projectId: 'orders-project',
    sourcePath: 'cases/orders.yaml',
    absolutePath,
  };
};

describe('workflow document collection', () => {
  const node = defineNode({ name: 'test.record', execute() {} });

  it('collects and normalizes every workflow with stable positional ids', () => {
    const source = createDocument(`
workflows:
  - name: Create order
    steps:
      - test.record: first
  - name: Create order
    steps:
      - test.record:
          prompt: second
          $:
            continue-on-error: true
`);
    const document = collectWorkflowDocument(source, {
      resolveNode: (name) => (name === node.name ? node : undefined),
    });

    expect(document.workflows).toHaveLength(2);
    expect(document.workflows[0]).toMatchObject({
      testId: createWorkflowTestId('orders-project', 'cases/orders.yaml', 0),
      workflowIndex: 0,
      definition: {
        name: 'Create order',
        steps: [{ node: 'test.record', input: { prompt: 'first' } }],
      },
    });
    expect(document.workflows[1].testId).not.toBe(document.workflows[0].testId);
  });

  it.each([
    ['other: true', 'unsupported field'],
    ['workflows: []', 'non-empty workflows'],
    [
      'workflows:\n  - name: valid\n    extra: true\n    steps:\n      - test.record: ok',
      'unsupported field',
    ],
    [
      'workflows:\n  - name: ""\n    steps:\n      - test.record: ok',
      'non-empty string',
    ],
    [
      'workflows:\n  - name: unknown\n    steps:\n      - missing.node: fail',
      'unknown node',
    ],
  ])('rejects an invalid document: %s', (yaml, message) => {
    const source = createDocument(yaml);
    expect(() =>
      collectWorkflowDocument(source, {
        resolveNode: (name) => (name === node.name ? node : undefined),
      }),
    ).toThrow(message);
  });
});
