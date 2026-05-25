import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRstestYamlProject,
  resolveTestName,
} from '@/framework/rstest-project';
import { describe, expect, test } from 'vitest';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-rstest-'));

describe('rstest yaml project generation', () => {
  test('generates a Rstest config and one test file for each YAML file', () => {
    const root = createTempDir();
    const outputDir = join(root, 'runner');
    const yamlA = join(root, 'cases', 'checkout.yaml');
    const yamlB = join(root, 'cases', '中文 case.yaml');
    mkdirSync(join(root, 'cases'), { recursive: true });
    writeFileSync(yamlA, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlB, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const project = createRstestYamlProject({
        files: [yamlA, yamlB],
        projectDir: root,
        outputDir,
        frameworkImport: '@test/framework',
        rstestImport: '@test/rstest-core',
        maxConcurrency: 2,
      });

      expect(project.configFile).toBe(join(outputDir, 'rstest.config.ts'));
      expect(project.cases).toHaveLength(2);
      expect(project.cases[0].testName).toBe('cases/checkout.yaml');
      expect(project.cases[0].resultFile).toBe(
        join(outputDir, 'results', '001-checkout.json'),
      );
      expect(project.cases[1].testName).toBe('cases/中文 case.yaml');

      const config = readFileSync(project.configFile, 'utf8');
      expect(config).toContain('"maxConcurrency": 2');
      expect(config).toContain(project.cases[0].testFile);

      const generated = readFileSync(project.cases[1].testFile, 'utf8');
      expect(generated).toContain('import { test } from "@test/rstest-core"');
      expect(generated).toContain('await import("@test/framework")');
      expect(generated).toContain('runYamlCaseInChildProcess');
      expect(generated).toContain('frameworkImport: "@test/framework"');
      expect(generated).toContain(JSON.stringify(yamlB));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('replaces stale generated files when output directory already exists', () => {
    const root = createTempDir();
    const outputDir = join(root, 'runner');
    const staleFile = join(outputDir, 'generated', 'stale.test.ts');
    const yaml = join(root, 'case.yaml');
    mkdirSync(join(outputDir, 'generated'), { recursive: true });
    writeFileSync(staleFile, 'stale', { flag: 'w' });
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const project = createRstestYamlProject({
        files: [yaml],
        projectDir: root,
        outputDir,
      });

      expect(project.cases).toHaveLength(1);
      expect(() => readFileSync(staleFile, 'utf8')).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses absolute path as test name when YAML is outside the project root', () => {
    const projectDir = '/tmp/project';
    const yamlFile = '/tmp/other/script.yaml';

    expect(resolveTestName(projectDir, yamlFile)).toBe(yamlFile);
  });
});
