import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
import type {
  GeneratedRstestYamlProject,
  GeneratedYamlTestCase,
} from './rstest-project';

export interface RunRstestYamlProjectOptions {
  project: GeneratedRstestYamlProject;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
}

// `@rstest/core` and `@rsbuild/core` are direct dependencies of `@midscene/cli`,
// so they always sit on the resolution path of the CLI's own files. Anchor the
// lookup to this module's location (`__dirname` of the bundled output) rather
// than `process.argv[1]`: the command-line entry can be a wrapper script, a
// symlinked bin, an `npx` cache path, or some other launcher whose `node_modules`
// chain does not include `@rstest/core`. Anchoring on `process.argv[1]` is what
// caused YAML runs to fail with "Cannot find module '@rstest/core/package.json'"
// in environments where the launcher differs from the install location.
const requireFromCliPackage = () => {
  if (typeof __dirname !== 'undefined') {
    return createRequire(join(__dirname, 'index.js'));
  }
  // ESM consumers of the bundled output have no `__dirname`; fall back to the
  // command-line entry so programmatic usage keeps working.
  const entry = process.argv[1]
    ? resolve(process.argv[1])
    : join(process.cwd(), 'midscene-cli.js');
  return createRequire(entry);
};

const resolvePackageFromRstestCore = (packageName: string): string => {
  const require = requireFromCliPackage();
  const rstestPackageJsonPath = require.resolve('@rstest/core/package.json');
  return createRequire(rstestPackageJsonPath).resolve(packageName);
};

export function resolveRstestCoreImportPath(): string {
  const require = requireFromCliPackage();
  const packageJsonPath = require.resolve('@rstest/core/package.json');
  return join(dirname(packageJsonPath), 'dist', 'index.js');
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
// resolved YAML file path. A test-level failure matches on the test name (which
// equals the case's `testName`); a file-level failure (e.g. the test module
// could not be loaded) matches on the generated virtual module id.
const mapRunErrorsToCases = (
  project: GeneratedRstestYamlProject,
  result: TestRunResult,
): Map<string, string> => {
  const byTestName = new Map(
    project.cases.map((item) => [item.testName, item]),
  );
  const errors = new Map<string, string>();
  const add = (item: GeneratedYamlTestCase | undefined, message: string) => {
    if (item && message && !errors.has(item.yamlFile)) {
      errors.set(item.yamlFile, message);
    }
  };
  const matchFileCase = (
    file: TestRunResult['files'][number],
  ): GeneratedYamlTestCase | undefined => {
    for (const key of [file.name, file.testPath]) {
      if (!key) continue;
      const matched = project.cases.find(
        (item) => key === item.testModule || key.includes(item.testModule),
      );
      if (matched) return matched;
    }
    return undefined;
  };

  for (const file of result.files ?? []) {
    const fileCase = matchFileCase(file);
    for (const error of file.errors ?? []) {
      add(fileCase, errorMessage(error));
    }
    for (const testResult of file.results ?? []) {
      const item = byTestName.get(testResult.name) ?? fileCase;
      for (const error of testResult.errors ?? []) {
        add(item, errorMessage(error));
      }
    }
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
    const error = caseErrors.get(item.yamlFile);
    if (!error) continue;
    const failure: MidsceneYamlConfigResult = {
      file: item.yamlFile,
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

export async function runRstestYamlProject(
  options: RunRstestYamlProjectOptions,
): Promise<number> {
  const [{ runRstest }, { rspack }] = await Promise.all([
    import('@rstest/core/api'),
    import(pathToFileURL(resolvePackageFromRstestCore('@rsbuild/core')).href),
  ]);
  const { project } = options;
  const maxConcurrency =
    project.maxConcurrency !== undefined
      ? Math.max(1, project.maxConcurrency)
      : undefined;
  const inlineConfig: RstestUserConfig = {
    root: project.projectDir,
    include: project.include,
    testEnvironment: 'node',
    testTimeout: project.testTimeout,
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    ...(maxConcurrency !== undefined
      ? { pool: { maxWorkers: maxConcurrency, minWorkers: maxConcurrency } }
      : {}),
    ...(project.bail !== undefined ? { bail: project.bail } : {}),
    reporters: [],
    tools: {
      rspack: (_config, { appendPlugins }) => {
        appendPlugins(
          new rspack.experiments.VirtualModulesPlugin(project.virtualModules),
        );
      },
    },
  };

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
