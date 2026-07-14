import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectWorkflowDocument,
  createCaseId,
  createWorkflowDocumentId,
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
  const documentNode = defineNode({
    name: 'test.document',
    execute() {},
  });

  it('collects and normalizes every case with stable positional ids', () => {
    const source = createDocument(`
cases:
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
      resolveNode: (name) =>
        [node, documentNode].find((candidate) => candidate.name === name),
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
    expect(document.cases).toHaveLength(2);
    expect(document.cases[0]).toMatchObject({
      caseId: createCaseId('orders-project', 'cases/orders.yaml', 0),
      caseIndex: 0,
      definition: {
        name: 'Create order',
        steps: [{ node: 'test.record', input: { prompt: 'first' } }],
      },
    });
    expect(document.cases[1].caseId).not.toBe(document.cases[0].caseId);
  });

  it('normalizes all lifecycle fields and allows explicit empty arrays', () => {
    const source = createDocument(`
afterAll:
  - test.document: last
afterEach: []
cases:
  - name: lifecycle
    steps:
      - test.record: body
beforeEach:
  - test.record: each
beforeAll:
  - test.document: first
`);
    const document = collectWorkflowDocument(source, {
      resolveNode: (name) =>
        [node, documentNode].find((candidate) => candidate.name === name),
    });

    expect(document.lifecycle.beforeAll[0]).toMatchObject({
      node: 'test.document',
      input: { prompt: 'first' },
    });
    expect(document.lifecycle.beforeEach[0].node).toBe('test.record');
    expect(document.lifecycle.afterEach).toEqual([]);
    expect(document.lifecycle.afterAll[0].input).toEqual({ prompt: 'last' });
  });

  it('resolves the same node registry in every lifecycle phase', () => {
    const source = createDocument(`
beforeAll:
  - test.record: document phase
beforeEach:
  - test.document: case phase
cases:
  - name: valid
    steps:
      - test.record: body
`);
    const document = collectWorkflowDocument(source, {
      resolveNode: (name) =>
        [node, documentNode].find((candidate) => candidate.name === name),
    });

    expect(document.lifecycle.beforeAll[0].node).toBe('test.record');
    expect(document.lifecycle.beforeEach[0].node).toBe('test.document');
  });

  it.each([
    ['other: true', 'unsupported field'],
    ['workflows: []', 'unsupported field "workflows"'],
    ['cases: []', 'non-empty cases'],
    [
      'beforeAll: true\ncases:\n  - name: valid\n    steps:\n      - test.record: ok',
      'beforeAll must be an array',
    ],
    [
      'cases:\n  - name: valid\n    extra: true\n    steps:\n      - test.record: ok',
      'unsupported field',
    ],
    [
      'cases:\n  - name: ""\n    steps:\n      - test.record: ok',
      'non-empty string',
    ],
    [
      'cases:\n  - name: unknown\n    steps:\n      - missing.node: fail',
      'unknown node',
    ],
  ])('rejects an invalid document: %s', (yaml, message) => {
    const source = createDocument(yaml);
    expect(() =>
      collectWorkflowDocument(source, {
        resolveNode: (name) =>
          [node, documentNode].find((candidate) => candidate.name === name),
      }),
    ).toThrow(message);
  });
});
