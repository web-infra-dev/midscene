import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_YAML_TEST_TIMEOUT,
  createRstestYamlProject,
  resolveTestName,
} from '@/framework/rstest-project';
import { describe, expect, test } from 'vitest';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-rstest-'));

describe('rstest yaml project generation', () => {
  test('generates virtual Rstest entries for each YAML file', () => {
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

      expect(project.projectDir).toBe(root);
      expect(project.outputDir).toBe(outputDir);
      expect(project.include).toEqual([
        'virtual/midscene-yaml/001-checkout.test.ts',
        'virtual/midscene-yaml/002-case.test.ts',
      ]);
      expect(project.cases).toHaveLength(2);
      expect(project.cases[0].testName).toBe('cases/checkout.yaml');
      expect(project.cases[0].resultFile).toBe(
        join(outputDir, 'results', '001-checkout.json'),
      );
      expect(project.cases[1].testName).toBe('cases/中文 case.yaml');
      expect(project.maxConcurrency).toBe(2);
      expect(project.testTimeout).toBe(DEFAULT_YAML_TEST_TIMEOUT);

      const generated = project.virtualModules[project.cases[1].testModule];
      expect(generated).toContain('import { test } from "@test/rstest-core"');
      expect(generated).toContain('await import("@test/framework")');
      expect(generated).toContain('runYamlCaseInChildProcess');
      expect(generated).toContain('frameworkImport: "@test/framework"');
      expect(generated).toContain(JSON.stringify(yamlB));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('allows overriding the YAML test timeout', () => {
    const root = createTempDir();
    const outputDir = join(root, 'runner');
    const yaml = join(root, 'case.yaml');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const project = createRstestYamlProject({
        files: [yaml],
        projectDir: root,
        outputDir,
        testTimeout: 180_000,
      });

      expect(project.testTimeout).toBe(180_000);
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
      expect(existsSync(staleFile)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses absolute path as test name when YAML is outside the project root', () => {
    const projectDir = '/tmp/project';
    const yamlFile = '/tmp/other/script.yaml';

    expect(resolveTestName(projectDir, yamlFile)).toBe(yamlFile);
  });

  test('generates a single batch virtual entry for shared browser context', () => {
    const root = createTempDir();
    const outputDir = join(root, 'runner');
    const yamlA = join(root, 'login.yaml');
    const yamlB = join(root, 'check.yaml');
    writeFileSync(yamlA, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlB, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const project = createRstestYamlProject({
        files: [yamlA, yamlB],
        projectDir: root,
        outputDir,
        frameworkImport: '@test/framework',
        rstestImport: '@test/rstest-core',
        batchConfig: {
          files: [yamlA, yamlB],
          concurrent: 1,
          continueOnError: true,
          summary: 'summary.json',
          shareBrowserContext: true,
          globalConfig: {
            web: {
              url: 'https://example.com',
            },
          },
          headed: false,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
      });

      expect(project.include).toEqual(['virtual/midscene-yaml/batch.test.ts']);
      expect(project.cases).toHaveLength(2);
      expect(project.maxConcurrency).toBe(1);
      expect(project.batchManifestFile).toBe(
        join(outputDir, 'batch-manifest.json'),
      );
      expect(existsSync(project.batchManifestFile!)).toBe(true);

      const generated = project.virtualModules[project.include[0]];
      expect(generated).toContain('runYamlBatchInRstestFromManifest');
      expect(generated).toContain(JSON.stringify(project.batchManifestFile));
      expect(generated).not.toContain('"shareBrowserContext": true');
      expect(generated).not.toContain(JSON.stringify(yamlA));
      expect(generated).not.toContain(JSON.stringify(yamlB));

      const manifest = JSON.parse(
        readFileSync(project.batchManifestFile!, 'utf8'),
      );
      expect(manifest.config).toMatchObject({
        files: [yamlA, yamlB],
        concurrent: 1,
        shareBrowserContext: true,
      });
      expect(manifest.resultFiles).toEqual({
        [yamlA]: join(outputDir, 'results', '001-login.json'),
        [yamlB]: join(outputDir, 'results', '002-check.json'),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
