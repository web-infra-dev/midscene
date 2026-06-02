import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import { collectFrameworkTestFiles } from '../config';
import { loadFrameworkDotenv } from '../dotenv';
import {
  SUITE_SUMMARY_FILENAME,
  buildSuiteSummary,
  safeResultStem,
} from '../result';
import type {
  FrameworkCaseResult,
  FrameworkSuiteSummary,
  MidsceneFrameworkConfig,
} from '../types';
import { type SuiteRuntimeOptions, createSuiteRuntime } from './suite';

const debugFramework = getDebug('testing-framework', { console: true });

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Per-test options understood by Rstest's `test()` third argument. Only the
 * fields the framework forwards from `testRunner` are declared.
 */
export interface RstestTestOptions {
  timeout?: number;
  retry?: number;
}

/**
 * The slice of the Rstest test API the framework needs. It is always passed in
 * from the generated test module (which `import`s `@rstest/core` inside the
 * worker) so this runtime never statically imports `@rstest/core`; that keeps
 * the test API — and its `@vitest/expect` global — out of the runner process.
 */
export interface RstestTestApi {
  test: (
    name: string,
    fn: () => Promise<void> | void,
    options?: RstestTestOptions,
  ) => void;
  beforeAll: (fn: () => Promise<void> | void) => void;
  afterAll: (fn: () => Promise<void> | void) => void;
}

export interface RegisterMidsceneSuiteOptions extends SuiteRuntimeOptions {
  rstest: RstestTestApi;
  /**
   * Directory the per-case result JSON files are written to. Defaults to
   * `process.env.MIDSCENE_FRAMEWORK_RESULT_DIR` so the runner can collect them.
   */
  resultDir?: string;
}

const ENV_RESULT_DIR = 'MIDSCENE_FRAMEWORK_RESULT_DIR';

const testOptionsOf = (
  config: MidsceneFrameworkConfig,
): RstestTestOptions | undefined => {
  const timeout = config.testRunner?.testTimeout;
  const retry = config.testRunner?.retry;
  if (timeout === undefined && retry === undefined) {
    return undefined;
  }
  return {
    ...(timeout !== undefined ? { timeout } : {}),
    ...(retry !== undefined ? { retry } : {}),
  };
};

const writeJsonFile = (filePath: string, value: unknown): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
};

/**
 * Persist the one summary the worker owns: always to `resultDir/summary.json`
 * (the runner's hand-off channel) and, when configured, to the user-facing
 * `output.summary` path.
 */
const writeSuiteSummary = (params: {
  config: MidsceneFrameworkConfig;
  projectDir: string;
  resultDir?: string;
  summary: FrameworkSuiteSummary;
}): void => {
  if (params.resultDir) {
    writeJsonFile(
      join(params.resultDir, SUITE_SUMMARY_FILENAME),
      params.summary,
    );
  }
  const target = params.config.output?.summary;
  if (target) {
    writeJsonFile(resolve(params.projectDir, target), params.summary);
  }
};

/**
 * Mode A entry. Runs inside an Rstest worker: it loads `.env`, discovers the
 * YAML cases (and folds in any user `.test.ts` files), sets the shared agent up
 * once, registers one `test()` per YAML case, and writes the suite summary on
 * teardown.
 *
 * Must be awaited at the top level of the bootstrap module so discovery
 * finishes before Rstest collects the registered tests.
 */
export async function registerMidsceneSuite(
  options: RegisterMidsceneSuiteOptions,
): Promise<void> {
  const { config, projectDir, rstest } = options;

  loadFrameworkDotenv({
    cwd: process.cwd(),
    configDir: projectDir,
    envConfig: config.env,
  });

  const files = await collectFrameworkTestFiles({ root: projectDir, config });
  const yamlFiles = files.filter((file) => file.type === 'yaml');
  const userTestFiles = files.filter((file) => file.type === 'test');

  // Mode A drives only the discovered YAML cases. Native `.test.ts` files
  // cannot be folded in here (a runtime `import()` of a `.ts` path bypasses
  // Rstest's transform), so they belong to an emitted Mode B project where
  // Rstest's own `include` compiles them.
  if (userTestFiles.length > 0) {
    debugFramework(
      `Ignoring ${userTestFiles.length} ".test.ts" file(s) in mode A; run "midscene emit" to include them in a native Rstest project.`,
    );
  }

  // `maxConcurrency` has no effect in mode A: the cases share one agent and run
  // sequentially in a single Rstest file, so there is nothing to parallelize.
  // It only matters in an emitted mode B project's `rstest.config.ts`.
  if (config.testRunner?.maxConcurrency !== undefined) {
    debugFramework(
      'testRunner.maxConcurrency has no effect in mode A (cases share one agent and run sequentially); it only applies to an emitted (mode B) project.',
    );
  }

  if (yamlFiles.length === 0) {
    return;
  }

  const runtime = createSuiteRuntime({ config, projectDir });
  const resultDir = options.resultDir ?? process.env[ENV_RESULT_DIR];
  // Keyed by case path so a retried case overwrites its earlier attempt
  // instead of being counted multiple times in the summary.
  const results = new Map<string, FrameworkCaseResult>();
  const testOptions = testOptionsOf(config);
  let suiteError: string | undefined;

  // Approximate Rstest's run-level `bail`: once `bail` real failures occur,
  // remaining cases fail fast without running their (expensive) AI flow. The
  // run-level option itself is unreachable here because mode A never loads the
  // config in the runner process, so the budget is enforced case-by-case.
  const bailLimit = config.testRunner?.bail ?? 0;
  let failureCount = 0;

  rstest.beforeAll(async () => {
    try {
      await runtime.setup();
    } catch (error) {
      // Record the setup failure so a `total: 0` summary is not mistaken for
      // "no cases"; rethrow so Rstest still fails the suite.
      suiteError = errorMessageOf(error);
      throw error;
    }
  });

  rstest.afterAll(async () => {
    await runtime.teardown();
    writeSuiteSummary({
      config,
      projectDir,
      resultDir,
      summary: {
        ...buildSuiteSummary([...results.values()]),
        ...(suiteError ? { suiteError } : {}),
      },
    });
  });

  yamlFiles.forEach((file, index) => {
    const resultFile = resultDir
      ? join(resultDir, `${safeResultStem(file.relativePath, index)}.json`)
      : undefined;
    rstest.test(
      file.relativePath,
      async () => {
        if (bailLimit > 0 && failureCount >= bailLimit) {
          const bailed: FrameworkCaseResult = {
            file: file.filePath,
            testName: file.relativePath,
            success: false,
            duration: 0,
            error: `Bailed: ${bailLimit} failure(s) reached before this case ran`,
          };
          results.set(file.filePath, bailed);
          throw new Error(bailed.error);
        }

        const result = await runtime.runCase(file.filePath, resultFile);
        results.set(file.filePath, result);
        if (!result.success) {
          failureCount += 1;
          throw new Error(
            result.error || `YAML case failed: ${result.testName}`,
          );
        }
      },
      testOptions,
    );
  });
}

export interface DefineMidsceneCaseTestOptions extends SuiteRuntimeOptions {
  rstest: RstestTestApi;
  /** Absolute path to the YAML case to run. */
  yamlFile: string;
  /** Display name for the test. Defaults to the path relative to `projectDir`. */
  testName?: string;
  /** Optional path to persist the case result JSON to. */
  resultFile?: string;
}

/**
 * Mode B (emit) entry. Registers a single YAML case as one Rstest test with its
 * own agent lifecycle (`beforeAll` setup / `afterAll` teardown). Each emitted
 * `e2e/*.test.ts` calls this once.
 */
export function defineMidsceneCaseTest(
  options: DefineMidsceneCaseTestOptions,
): void {
  const { config, projectDir, rstest, yamlFile } = options;
  const runtime = createSuiteRuntime({ config, projectDir });
  const testName =
    options.testName || relative(projectDir, yamlFile) || yamlFile;

  rstest.beforeAll(async () => {
    loadFrameworkDotenv({
      cwd: process.cwd(),
      configDir: projectDir,
      envConfig: config.env,
    });
    await runtime.setup();
  });

  rstest.afterAll(async () => {
    await runtime.teardown();
  });

  rstest.test(
    testName,
    async () => {
      const result = await runtime.runCase(yamlFile, options.resultFile);
      if (!result.success) {
        throw new Error(result.error || `YAML case failed: ${testName}`);
      }
    },
    testOptionsOf(config),
  );
}
