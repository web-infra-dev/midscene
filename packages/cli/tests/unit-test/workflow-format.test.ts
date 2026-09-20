import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertLegacyBatchConfigPath,
  assertLegacyWorkflowSelection,
} from '@/workflow-format';
import { afterEach, describe, expect, test } from '@rstest/core';

const roots: string[] = [];
const fixture = (name: string, content: string) => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-format-'));
  roots.push(root);
  const path = join(root, name);
  writeFileSync(path, content);
  return path;
};

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('legacy command input boundary', () => {
  test('accepts only YAML batch config paths', () => {
    expect(() => assertLegacyBatchConfigPath('batch.yaml')).not.toThrow();
    expect(() => assertLegacyBatchConfigPath('batch.yml')).not.toThrow();
    expect(() => assertLegacyBatchConfigPath('midscene.config.ts')).toThrow(
      'midscene-test --config',
    );
  });

  test('accepts legacy tasks/flow files', () => {
    const legacy = fixture(
      'legacy.yaml',
      'tasks:\n  - name: old\n    flow: []\n',
    );
    expect(() => assertLegacyWorkflowSelection([legacy])).not.toThrow();
  });

  test('rejects native and mixed files together before execution', () => {
    const legacy = fixture('legacy.yaml', 'tasks: []\n');
    const native = fixture(
      'native.yaml',
      'cases:\n  - name: new\n    steps: []\n',
    );
    const mixed = fixture('mixed.yaml', 'tasks: []\ncases: []\n');

    expect(() =>
      assertLegacyWorkflowSelection([legacy, native, mixed]),
    ).toThrow(
      /midscene only runs legacy tasks\/flow YAML[\s\S]*native cases\/steps[\s\S]*mixed tasks\/flow and cases\/steps[\s\S]*midscene-test/,
    );
  });

  test('leaves invalid or unrelated YAML to the legacy parser', () => {
    const invalid = fixture('invalid.yaml', 'tasks: [\n');
    const unknown = fixture('unknown.yaml', 'files: [flow.yaml]\n');
    expect(() =>
      assertLegacyWorkflowSelection([invalid, unknown]),
    ).not.toThrow();
  });
});
