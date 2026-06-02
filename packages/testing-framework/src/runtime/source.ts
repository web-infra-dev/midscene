import type { MidsceneFrameworkConfig } from '../types';

const DEFAULT_RUNTIME_IMPORT = '@midscene/testing-framework/runtime';
const DEFAULT_RSTEST_IMPORT = '@rstest/core';

const lit = (value: string): string => JSON.stringify(value);

export interface CreateBootstrapModuleSourceOptions {
  /** Module specifier (absolute path) of the user's `midscene.config`. */
  configPath: string;
  /** Project root the cases are discovered and resolved against. */
  projectDir: string;
  /** Directory per-case result files are written to (embedded literally). */
  resultDir?: string;
  /** Import specifier for `@midscene/testing-framework/runtime`. */
  runtimeImport?: string;
  /** Import specifier for the Rstest test API. */
  rstestImport?: string;
}

/**
 * Generate the Mode A bootstrap module. It runs inside the Rstest worker, so it
 * is the only place the user's `midscene.config` (which may pull in Playwright)
 * is imported. Top-level `await` lets `registerMidsceneSuite` finish async case
 * discovery before Rstest collects the registered tests.
 */
export function createBootstrapModuleSource(
  options: CreateBootstrapModuleSourceOptions,
): string {
  const runtimeImport = options.runtimeImport || DEFAULT_RUNTIME_IMPORT;
  const rstestImport = options.rstestImport || DEFAULT_RSTEST_IMPORT;

  const resultDirLine =
    options.resultDir !== undefined
      ? `\n  resultDir: ${lit(options.resultDir)},`
      : '';

  return `import { afterAll, beforeAll, test } from ${lit(rstestImport)};
import config from ${lit(options.configPath)};
import { registerMidsceneSuite } from ${lit(runtimeImport)};

await registerMidsceneSuite({
  config,
  projectDir: ${lit(options.projectDir)},${resultDirLine}
  rstest: { test, beforeAll, afterAll },
});
`;
}

export interface CreateCaseTestSourceOptions {
  /** Import specifier (relative) of the emitted `midscene.config`. */
  configImport: string;
  /** Expression evaluated at runtime to the YAML file's absolute path. */
  yamlFileExpr: string;
  /** Expression evaluated at runtime to the project dir absolute path. */
  projectDirExpr: string;
  testName: string;
  runtimeImport?: string;
  rstestImport?: string;
}

/**
 * Generate a single `e2e/*.test.ts` for an emitted native Rstest project. Each
 * file owns one YAML case with its own agent lifecycle.
 */
export function createCaseTestSource(
  options: CreateCaseTestSourceOptions,
): string {
  const runtimeImport = options.runtimeImport || DEFAULT_RUNTIME_IMPORT;
  const rstestImport = options.rstestImport || DEFAULT_RSTEST_IMPORT;

  return `import { resolve } from 'node:path';
import { afterAll, beforeAll, test } from ${lit(rstestImport)};
import { defineMidsceneCaseTest } from ${lit(runtimeImport)};
import config from ${lit(options.configImport)};

defineMidsceneCaseTest({
  config,
  projectDir: ${options.projectDirExpr},
  yamlFile: ${options.yamlFileExpr},
  testName: ${lit(options.testName)},
  rstest: { test, beforeAll, afterAll },
});
`;
}

export interface CreateRstestConfigSourceOptions {
  include: string[];
  testRunner?: MidsceneFrameworkConfig['testRunner'];
}

/**
 * Generate a thin `rstest.config.ts` for an emitted project. It deliberately
 * does not import the user's `midscene.config`; run-level options are baked in
 * as literals from `testRunner`.
 */
export function createRstestConfigSource(
  options: CreateRstestConfigSourceOptions,
): string {
  const runner = options.testRunner || {};
  const lines: string[] = [
    "  testEnvironment: 'node',",
    `  include: ${JSON.stringify(options.include)},`,
  ];
  if (runner.testTimeout !== undefined) {
    lines.push(`  testTimeout: ${runner.testTimeout},`);
  }
  if (runner.retry !== undefined) {
    lines.push(`  retry: ${runner.retry},`);
  }
  if (runner.bail !== undefined) {
    lines.push(`  bail: ${runner.bail},`);
  }
  if (runner.maxConcurrency !== undefined) {
    lines.push(`  maxConcurrency: ${runner.maxConcurrency},`);
    lines.push(
      `  pool: { maxWorkers: ${runner.maxConcurrency}, minWorkers: ${runner.maxConcurrency} },`,
    );
  }

  return `import { defineConfig } from '@rstest/core';

export default defineConfig({
${lines.join('\n')}
});
`;
}

export interface CreatePackageJsonSourceOptions {
  name?: string;
  /** Version range for `@rstest/core` and `@midscene/testing-framework`. */
  rstestVersion?: string;
  frameworkVersion?: string;
}

/** Generate a `package.json` for an emitted native Rstest project. */
export function createPackageJsonSource(
  options: CreatePackageJsonSourceOptions = {},
): string {
  const pkg = {
    name: options.name || 'midscene-rstest-project',
    private: true,
    version: '0.0.0',
    scripts: {
      test: 'rstest run',
      'test:watch': 'rstest',
    },
    devDependencies: {
      '@rstest/core': options.rstestVersion || 'latest',
    },
    dependencies: {
      '@midscene/testing-framework': options.frameworkVersion || 'latest',
    },
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
