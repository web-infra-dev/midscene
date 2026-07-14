import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectWorkflowDocument,
  createWorkflowDocumentId,
  createWorkflowTestId,
  defineDocumentNode,
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
  const documentNode = defineDocumentNode({
    name: 'test.document',
    execute() {},
  });

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
      resolveDocumentNode: (name) =>
        name === documentNode.name ? documentNode : undefined,
    });

    expect(document.documentId).toBe(
      createWorkflowDocumentId('orders-project', 'cases/orders.yaml'),
    );
    expect(document.lifecycle).toEqual({
      beforeAll: [],
      beforeEach: [],
      afterEach: [],
      afterAll: [],
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

  it('normalizes all lifecycle fields and allows explicit empty arrays', () => {
    const source = createDocument(`
afterAll:
  - test.document: last
afterEach: []
workflows:
  - name: lifecycle
    steps:
      - test.record: body
beforeEach:
  - test.record: each
beforeAll:
  - test.document: first
`);
    const document = collectWorkflowDocument(source, {
      resolveNode: (name) => (name === node.name ? node : undefined),
      resolveDocumentNode: (name) =>
        name === documentNode.name ? documentNode : undefined,
    });

    expect(document.lifecycle.beforeAll[0]).toMatchObject({
      node: 'test.document',
      input: { prompt: 'first' },
    });
    expect(document.lifecycle.beforeEach[0].node).toBe('test.record');
    expect(document.lifecycle.afterEach).toEqual([]);
    expect(document.lifecycle.afterAll[0].input).toEqual({ prompt: 'last' });
  });

  it('resolves lifecycle nodes only from their matching scope', () => {
    const documentScopeMismatch = createDocument(`
beforeAll:
  - test.record: wrong registry
workflows:
  - name: invalid
    steps:
      - test.record: body
`);
    expect(() =>
      collectWorkflowDocument(documentScopeMismatch, {
        resolveNode: (name) => (name === node.name ? node : undefined),
        resolveDocumentNode: (name) =>
          name === documentNode.name ? documentNode : undefined,
      }),
    ).toThrow('beforeAll step 1 references unknown node "test.record"');

    const workflowScopeMismatch = createDocument(`
beforeEach:
  - test.document: wrong registry
workflows:
  - name: invalid
    steps:
      - test.record: body
`);
    expect(() =>
      collectWorkflowDocument(workflowScopeMismatch, {
        resolveNode: (name) => (name === node.name ? node : undefined),
        resolveDocumentNode: (name) =>
          name === documentNode.name ? documentNode : undefined,
      }),
    ).toThrow('beforeEach step 1 references unknown node "test.document"');
  });

  it.each([
    ['other: true', 'unsupported field'],
    ['workflows: []', 'non-empty workflows'],
    [
      'beforeAll: true\nworkflows:\n  - name: valid\n    steps:\n      - test.record: ok',
      'beforeAll must be an array',
    ],
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
        resolveDocumentNode: (name) =>
          name === documentNode.name ? documentNode : undefined,
      }),
    ).toThrow(message);
  });
});
