import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectFrameworkTestFiles } from '../../src/config';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'midscene-framework-discovery-'));
  const e2e = join(root, 'e2e');
  mkdirSync(join(e2e, 'nested'), { recursive: true });
  writeFileSync(join(e2e, 'b-case.yaml'), 'flow: []\n');
  writeFileSync(join(e2e, 'a-case.yml'), 'flow: []\n');
  writeFileSync(join(e2e, 'nested', 'c-case.yaml'), 'flow: []\n');
  writeFileSync(join(e2e, 'draft-case.draft.yaml'), 'flow: []\n');
  writeFileSync(join(e2e, 'complex.test.ts'), 'export {};\n');
  writeFileSync(join(e2e, 'notes.txt'), 'ignore me\n');
});

describe('collectFrameworkTestFiles', () => {
  it('collects yaml/yml via include and sorts stably', async () => {
    const files = await collectFrameworkTestFiles({
      root,
      config: { testDir: './e2e', include: ['**/*.yaml', '**/*.yml'] },
    });
    const relatives = files.map((file) => file.relativePath);
    expect(relatives).toEqual([
      'e2e/a-case.yml',
      'e2e/b-case.yaml',
      'e2e/draft-case.draft.yaml',
      'e2e/nested/c-case.yaml',
    ]);
    expect(files.every((file) => file.type === 'yaml')).toBe(true);
  });

  it('applies exclude patterns', async () => {
    const files = await collectFrameworkTestFiles({
      root,
      config: {
        testDir: './e2e',
        include: ['**/*.yaml'],
        exclude: ['**/*.draft.yaml'],
      },
    });
    const relatives = files.map((file) => file.relativePath);
    expect(relatives).toEqual(['e2e/b-case.yaml', 'e2e/nested/c-case.yaml']);
  });

  it('discovers .test.ts files and tags their type', async () => {
    const files = await collectFrameworkTestFiles({
      root,
      config: { testDir: './e2e', include: ['**/*.test.ts'] },
    });
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('e2e/complex.test.ts');
    expect(files[0].type).toBe('test');
  });

  it('dedupes overlapping include patterns', async () => {
    const files = await collectFrameworkTestFiles({
      root,
      config: {
        testDir: './e2e',
        include: ['**/*.yaml', 'b-case.yaml'],
      },
    });
    const count = files.filter(
      (file) => file.relativePath === 'e2e/b-case.yaml',
    ).length;
    expect(count).toBe(1);
  });
});
