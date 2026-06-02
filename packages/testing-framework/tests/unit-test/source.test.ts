import { describe, expect, it } from 'vitest';
import {
  createBootstrapModuleSource,
  createCaseTestSource,
  createPackageJsonSource,
  createRstestConfigSource,
} from '../../src/runtime/source';

describe('createBootstrapModuleSource', () => {
  it('imports the config + runtime and awaits registerMidsceneSuite', () => {
    const source = createBootstrapModuleSource({
      configPath: '/project/midscene.config.ts',
      projectDir: '/project',
      resultDir: '/project/.out/results',
    });
    expect(source).toContain('resultDir: "/project/.out/results"');
    expect(source).toContain(
      'import { afterAll, beforeAll, test } from "@rstest/core"',
    );
    expect(source).toContain(
      'import config from "/project/midscene.config.ts"',
    );
    expect(source).toContain(
      'import { registerMidsceneSuite } from "@midscene/testing-framework/runtime"',
    );
    expect(source).toContain('await registerMidsceneSuite({');
    expect(source).toContain('projectDir: "/project"');
    expect(source).toContain('rstest: { test, beforeAll, afterAll }');
  });
});

describe('createCaseTestSource', () => {
  it('wires a single case to defineMidsceneCaseTest with runtime-resolved paths', () => {
    const source = createCaseTestSource({
      configImport: '../midscene.config',
      yamlFileExpr: 'resolve(__dirname, "a.yaml")',
      projectDirExpr: 'resolve(__dirname, "..")',
      testName: 'e2e/a.yaml',
    });
    expect(source).toContain('import config from "../midscene.config"');
    expect(source).toContain('defineMidsceneCaseTest({');
    expect(source).toContain('yamlFile: resolve(__dirname, "a.yaml")');
    expect(source).toContain('projectDir: resolve(__dirname, "..")');
    expect(source).toContain('testName: "e2e/a.yaml"');
  });
});

describe('createRstestConfigSource', () => {
  it('bakes testRunner options as literals without importing the user config', () => {
    const source = createRstestConfigSource({
      include: ['e2e/**/*.test.ts'],
      testRunner: { testTimeout: 120000, bail: 0, maxConcurrency: 2, retry: 1 },
    });
    expect(source).not.toContain('midscene.config');
    expect(source).toContain("testEnvironment: 'node'");
    expect(source).toContain('include: ["e2e/**/*.test.ts"]');
    expect(source).toContain('testTimeout: 120000');
    expect(source).toContain('retry: 1');
    expect(source).toContain('bail: 0');
    expect(source).toContain('maxConcurrency: 2');
    expect(source).toContain('pool: { maxWorkers: 2, minWorkers: 2 }');
  });

  it('omits optional fields when testRunner is absent', () => {
    const source = createRstestConfigSource({ include: ['e2e/**/*.test.ts'] });
    expect(source).not.toContain('testTimeout');
    expect(source).not.toContain('maxConcurrency');
  });
});

describe('createPackageJsonSource', () => {
  it('emits an rstest run script and pins dependencies', () => {
    const pkg = JSON.parse(
      createPackageJsonSource({ name: 'demo', rstestVersion: '0.10.3' }),
    );
    expect(pkg.name).toBe('demo');
    expect(pkg.scripts.test).toBe('rstest run');
    expect(pkg.devDependencies['@rstest/core']).toBe('0.10.3');
    expect(pkg.dependencies['@midscene/testing-framework']).toBe('latest');
  });
});
