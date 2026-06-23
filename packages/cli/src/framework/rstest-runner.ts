import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
import { resolvePackageFromRstestCore } from './rstest-dependencies';
import type {
  GeneratedRstestYamlProject,
  GeneratedYamlTestCase,
} from './rstest-project';

export { resolveRstestCoreImportPath } from './rstest-dependencies';

export interface RunRstestYamlProjectOptions {
  project: GeneratedRstestYamlProject;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
}

const DEFAULT_FEATURE_LOADER_PATH = join(__dirname, 'feature-loader.js');

type RspackPluginInput = Parameters<
  Parameters<
    Extract<
      NonNullable<NonNullable<RstestUserConfig['tools']>['rspack']>,
      (
        config: unknown,
        utils: { appendPlugins: (plugin: never) => void },
      ) => unknown
    >
  >[1]['appendPlugins']
>[0];

export interface RstestRspackDeps {
  rspack: {
    experiments: {
      VirtualModulesPlugin: new (
        modules: Record<string, string>,
      ) => RspackPluginInput;
    };
  };
  featureLoaderPath?: string;
}

const formatRunError = (
  error: TestRunResult['unhandledErrors'][number],
): string => error.stack || `${error.name}: ${error.message}`;

// Collect every failure rstest surfaced, not just `unhandledErrors`. A failing
// YAML case shows up as a file-level error (e.g. a module that cannot be
// loaded) or a test-level error under `files[].results[]`; `unhandledErrors`
// only covers worker crashes and config-load failures. Reporting just the
// latter is why a failed run printed nothing and looked like "not executed".
const collectRunErrors = (result: TestRunResult): string[] => {
  const messages: string[] = [];
  const push = (
    error: TestRunResult['unhandledErrors'][number],
    label?: string,
  ) => {
    const formatted = formatRunError(error);
    messages.push(label ? `${label}: ${formatted}` : formatted);
  };

  for (const file of result.files ?? []) {
    for (const error of file.errors ?? []) {
      push(error, file.name || file.testPath);
    }
    for (const testResult of file.results ?? []) {
      for (const error of testResult.errors ?? []) {
        push(error, testResult.name);
      }
    }
  }
  for (const error of result.unhandledErrors ?? []) {
    push(error);
  }

  return Array.from(new Set(messages));
};

const errorMessage = (
  error: TestRunResult['unhandledErrors'][number],
): string => error.message || error.name || 'YAML case failed';

// Attribute each rstest failure back to the YAML case it came from, keyed by the
// per-case result file. A test-level failure matches on the test name (which
// equals the case's `testName`); a file-level failure (e.g. the test module
// could not be loaded) matches on the generated virtual module id.
const mapRunErrorsToCases = (
  project: GeneratedRstestYamlProject,
  result: TestRunResult,
): Map<string, string> => {
  const byTestName = new Map(
    project.cases.map((item) => [item.testName, item]),
  );
  const byTestModule = new Map<string, GeneratedYamlTestCase[]>();
  for (const item of project.cases) {
    const items = byTestModule.get(item.testModule);
    if (items) {
      items.push(item);
    } else {
      byTestModule.set(item.testModule, [item]);
    }
  }
  const errors = new Map<string, string>();
  const add = (item: GeneratedYamlTestCase | undefined, message: string) => {
    if (item && message && !errors.has(item.resultFile)) {
      errors.set(item.resultFile, message);
    }
  };
  const addAll = (message: string) => {
    for (const item of project.cases) {
      add(item, message);
    }
  };
  const matchFileCases = (
    file: TestRunResult['files'][number],
  ): GeneratedYamlTestCase[] => {
    const fileKeys = [file.name, file.testPath].filter(
      (key): key is string => Boolean(key),
    );
    for (const key of fileKeys) {
      const matched = byTestModule.get(key);
      if (matched) return matched;
    }

    for (const key of fileKeys) {
      for (const [testModule, matched] of byTestModule) {
        if (key.includes(testModule)) return matched;
      }
    }

    return [];
  };
  const isBatchFile = (file: TestRunResult['files'][number]): boolean => {
    if (!project.batchTest) return false;
    for (const key of [file.name, file.testPath]) {
      if (
        key &&
        (key === project.batchTest.testModule ||
          key.includes(project.batchTest.testModule))
      ) {
        return true;
      }
    }
    return false;
  };
  const isBatchTest = (testName: string): boolean =>
    testName === project.batchTest?.testName;

  for (const file of result.files ?? []) {
    const fileCases = matchFileCases(file);
    const batchFile = isBatchFile(file);
    for (const error of file.errors ?? []) {
      const message = errorMessage(error);
      if (batchFile) {
        addAll(message);
      } else if (fileCases.length > 1) {
        for (const item of fileCases) add(item, message);
      } else {
        add(fileCases[0], message);
      }
    }
    for (const testResult of file.results ?? []) {
      const item = byTestName.get(testResult.name) ?? fileCases[0];
      for (const error of testResult.errors ?? []) {
        const message = errorMessage(error);
        if (isBatchTest(testResult.name) || batchFile) {
          addAll(message);
        } else {
          add(item, message);
        }
      }
    }
  }

  if (
    project.batchTest &&
    errors.size === 0 &&
    result.unhandledErrors?.length
  ) {
    addAll(errorMessage(result.unhandledErrors[0]));
  }

  // A single-case run whose failure rstest could not pin to a file/test (e.g. a
  // worker crash surfaced only via `unhandledErrors`) still belongs to that one
  // case — otherwise its real error would be lost to a blank "not executed".
  if (
    project.cases.length === 1 &&
    errors.size === 0 &&
    result.unhandledErrors?.length
  ) {
    add(project.cases[0], errorMessage(result.unhandledErrors[0]));
  }

  return errors;
};

// When a case fails before it can write its own result file (module load
// failure, crash before `writeResultFile`, ...), the batch reader would treat
// it as "not executed" with no error. Persist a failed result carrying the real
// error so the failure — and its cause — is visible in the summary JSON.
const recordUnreportedCaseFailures = (
  project: GeneratedRstestYamlProject,
  result: TestRunResult,
): void => {
  if (!project.cases.length) return;
  const caseErrors = mapRunErrorsToCases(project, result);
  for (const item of project.cases) {
    if (existsSync(item.resultFile)) continue;
    const error = caseErrors.get(item.resultFile);
    if (!error) continue;
    const failure: MidsceneYamlConfigResult = {
      file: item.yamlFile,
      testName: item.testName,
      success: false,
      executed: true,
      output: undefined,
      report: undefined,
      duration: 0,
      resultType: 'failed',
      error,
    };
    mkdirSync(dirname(item.resultFile), { recursive: true });
    writeFileSync(item.resultFile, JSON.stringify(failure, null, 2));
  }
};

export function createRstestInlineConfig(
  project: GeneratedRstestYamlProject,
  deps: RstestRspackDeps,
): RstestUserConfig {
  const maxConcurrency =
    project.maxConcurrency !== undefined
      ? Math.max(1, project.maxConcurrency)
      : undefined;

  return {
    root: project.projectDir,
    include: project.include,
    testEnvironment: 'node',
    testTimeout: project.testTimeout,
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    ...(maxConcurrency !== undefined
      ? { pool: { maxWorkers: maxConcurrency, minWorkers: maxConcurrency } }
      : {}),
    ...(project.bail !== undefined ? { bail: project.bail } : {}),
    ...(project.retry !== undefined && project.retry > 0
      ? { retry: project.retry }
      : {}),
    reporters: [],
    tools: {
      rspack: (config, { appendPlugins }) => {
        appendPlugins(
          new deps.rspack.experiments.VirtualModulesPlugin(
            project.virtualModules,
          ),
        );

        if (!project.featureLoaderOptions) return;

        config.module ??= {};
        config.module.rules ??= [];
        config.module.rules.push({
          test: /\.feature$/,
          type: 'javascript/auto',
          loader: deps.featureLoaderPath ?? DEFAULT_FEATURE_LOADER_PATH,
          options: project.featureLoaderOptions,
        });
      },
    },
  };
}

export async function runRstestYamlProject(
  options: RunRstestYamlProjectOptions,
): Promise<number> {
  const [{ runRstest }, { rspack }] = await Promise.all([
    import('@rstest/core/api'),
    import(pathToFileURL(resolvePackageFromRstestCore('@rsbuild/core')).href),
  ]);
  const { project } = options;
  const inlineConfig = createRstestInlineConfig(project, { rspack });

  const result = await runRstest({
    cwd: options.cwd || project.projectDir,
    inlineConfig,
  });

  if (!result.ok) {
    recordUnreportedCaseFailures(project, result);
    if (options.stdio !== 'pipe') {
      const runErrors = collectRunErrors(result);
      if (runErrors.length) {
        console.error(`\nYAML execution failed:\n${runErrors.join('\n\n')}`);
      }
    }
  }

  return result.ok ? 0 : 1;
}
