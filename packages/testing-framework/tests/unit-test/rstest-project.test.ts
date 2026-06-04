import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_CASE_TEST_TIMEOUT,
  createRstestProject,
  resolveTestName,
} from '../../src/rstest/project';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'mts-rstest-'));

describe('rstest project generation', () => {
  test('generates one virtual entry per case file', () => {
    const root = createTempDir();
    const outputDir = join(root, 'runner');
    const configPath = join(root, 'midscene.config.ts');
    const yamlA = join(root, 'e2e', 'checkout.yaml');
    const yamlB = join(root, 'e2e', '中文 case.yaml');
    mkdirSync(join(root, 'e2e'), { recursive: true });
    writeFileSync(configPath, 'export default {};');
    writeFileSync(yamlA, 'name: a\nflow: []\n');
    writeFileSync(yamlB, 'name: b\nflow: []\n');

    try {
      const project = createRstestProject({
        configPath,
        files: [yamlA, yamlB],
        projectDir: root,
        outputDir,
        frameworkImport: '@test/framework',
        maxConcurrency: 2,
        bail: 1,
        retry: 3,
      });

      expect(project.projectDir).toBe(root);
      expect(project.outputDir).toBe(outputDir);
      expect(project.include).toEqual([
        'virtual:midscene-tf/001-checkout.test.ts',
        'virtual:midscene-tf/002-case.test.ts',
      ]);
      expect(project.cases).toHaveLength(2);
      expect(project.cases[0].testName).toBe('e2e/checkout.yaml');
      expect(project.cases[0].resultFile).toBe(
        join(outputDir, 'results', '001-checkout.json'),
      );
      expect(project.cases[1].testName).toBe('e2e/中文 case.yaml');
      expect(project.maxConcurrency).toBe(2);
      expect(project.bail).toBe(1);
      expect(project.retry).toBe(3);
      expect(project.testTimeout).toBe(DEFAULT_CASE_TEST_TIMEOUT);

      const generated = project.virtualModules[project.cases[0].testModule];
      expect(generated).toContain(
        'import { defineMidsceneCaseTest } from "@test/framework"',
      );
      expect(generated).toContain('defineMidsceneCaseTest');
      // each entry carries the config path + its own yaml file
      expect(generated).toContain(JSON.stringify(configPath));
      expect(generated).toContain(JSON.stringify(yamlA));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('honors a custom test timeout', () => {
    const root = createTempDir();
    const configPath = join(root, 'midscene.config.ts');
    const yaml = join(root, 'case.yaml');
    writeFileSync(configPath, 'export default {};');
    writeFileSync(yaml, 'name: a\nflow: []\n');

    try {
      const project = createRstestProject({
        configPath,
        files: [yaml],
        projectDir: root,
        outputDir: join(root, 'runner'),
        testTimeout: 180_000,
      });
      expect(project.testTimeout).toBe(180_000);
      expect(project.virtualModules[project.cases[0].testModule]).toContain(
        '"testTimeout": 180000',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('clears a stale output directory before generating', () => {
    const root = createTempDir();
    const outputDir = join(root, 'runner');
    const configPath = join(root, 'midscene.config.ts');
    const yaml = join(root, 'case.yaml');
    const stale = join(outputDir, 'results', 'stale.json');
    mkdirSync(join(outputDir, 'results'), { recursive: true });
    writeFileSync(stale, 'stale');
    writeFileSync(configPath, 'export default {};');
    writeFileSync(yaml, 'name: a\nflow: []\n');

    try {
      const project = createRstestProject({
        configPath,
        files: [yaml],
        projectDir: root,
        outputDir,
      });
      expect(project.cases).toHaveLength(1);
      expect(existsSync(stale)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses the absolute path as test name when the case is outside the root', () => {
    expect(resolveTestName('/tmp/project', '/tmp/other/case.yaml')).toBe(
      '/tmp/other/case.yaml',
    );
  });
});
