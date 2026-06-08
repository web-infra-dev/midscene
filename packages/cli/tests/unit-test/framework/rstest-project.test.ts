import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_YAML_TEST_TIMEOUT,
  createRstestYamlProject,
  resolveDefaultFrameworkImport,
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
        maxConcurrency: 2,
      });

      expect(project.projectDir).toBe(root);
      expect(project.outputDir).toBe(outputDir);
      expect(project.include).toEqual([
        'virtual:midscene-yaml/001-checkout.test.ts',
        'virtual:midscene-yaml/002-case.test.ts',
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
      expect(generated).toContain(
        'import { defineYamlCaseTest } from "@test/framework"',
      );
      expect(generated).toContain('defineYamlCaseTest');
      expect(generated).toContain(JSON.stringify(yamlB));
      expect(generated).not.toContain('runYamlCaseInChildProcess');
      expect(generated).not.toContain('webRuntimeOptions');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps web runtime options separate from generic case options', () => {
    const root = createTempDir();
    const outputDir = join(root, 'runner');
    const yaml = join(root, 'case.yaml');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const project = createRstestYamlProject({
        files: [yaml],
        projectDir: root,
        outputDir,
        frameworkImport: '@test/framework',
        caseOptions: {
          [yaml]: {
            globalConfig: {
              web: {
                viewportWidth: 1280,
              },
            },
          },
        },
        webRuntimeOptions: {
          [yaml]: {
            headed: true,
            keepWindow: false,
          },
        },
      });

      const generated = project.virtualModules[project.cases[0].testModule];
      expect(generated).toContain('"caseOptions"');
      expect(generated).toContain('"webRuntimeOptions"');
      expect(generated).toContain('"viewportWidth": 1280');
      expect(generated).toContain('"headed": true');
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

  test('resolves the framework entry from the CLI module dir, not process.argv[1]', () => {
    // Installed layout: the CLI module directory contains framework/index.js.
    const moduleDir = createTempDir();
    mkdirSync(join(moduleDir, 'framework'), { recursive: true });
    writeFileSync(join(moduleDir, 'framework', 'index.js'), 'export {};');

    // process.argv[1] points at a launcher whose directory does NOT lead to the
    // framework entry (a .bin symlink / npx cache / wrapper). The original bug
    // derived the path from argv[1] and fell back to the bare specifier
    // `@midscene/cli/dist/lib/framework/index.js`, which the virtual test module
    // then could not resolve from the user's CWD. The fix must anchor on the
    // module directory instead and return an existing absolute path.
    const originalEntry = process.argv[1];
    const bogusLauncherDir = createTempDir();
    process.argv[1] = join(bogusLauncherDir, 'midscene');

    try {
      const resolved = resolveDefaultFrameworkImport(moduleDir);
      expect(resolved).toBe(join(moduleDir, 'framework', 'index.js'));
      expect(resolved).not.toBe('@midscene/cli/dist/lib/framework/index.js');
    } finally {
      process.argv[1] = originalEntry;
      rmSync(moduleDir, { recursive: true, force: true });
      rmSync(bogusLauncherDir, { recursive: true, force: true });
    }
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

      expect(project.include).toEqual(['virtual:midscene-yaml/batch.test.ts']);
      expect(project.batchTest).toEqual({
        testModule: 'virtual:midscene-yaml/batch.test.ts',
        testName: 'midscene yaml batch',
      });
      expect(project.cases).toHaveLength(2);
      expect(project.maxConcurrency).toBe(1);
      const generated = project.virtualModules[project.include[0]];
      expect(generated).toContain(
        'import { defineYamlBatchTest } from "@test/framework"',
      );
      expect(generated).toContain('defineYamlBatchTest');
      expect(generated).toContain('"shareBrowserContext": true');
      expect(generated).toContain(JSON.stringify(yamlA));
      expect(generated).toContain(JSON.stringify(yamlB));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
