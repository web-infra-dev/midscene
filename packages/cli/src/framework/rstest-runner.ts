import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
import { createYamlProgressReporter } from './progress-reporter';
import { RSTEST_YAML_CASE_IDS_META_KEY } from './rstest-contract';
import { resolvePackageFromRstestCore } from './rstest-dependencies';
import type { GeneratedRstestYamlProject } from './rstest-project';

export { resolveRstestCoreImportPath } from './rstest-dependencies';

export interface RunRstestYamlProjectOptions {
  project: GeneratedRstestYamlProject;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
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

// Attribute each rstest failure back to the YAML occurrence it came from.
// Test-level failures carry stable case IDs in Rstest metadata. File-level
// failures belong to every case owned by that generated module.
const mapRunErrorsToCases = (
  project: GeneratedRstestYamlProject,
  result: TestRunResult,
): Map<string, string> => {
  const casesById = new Map(project.cases.map((item) => [item.caseId, item]));
  const knownCaseIds = new Set(casesById.keys());
  const errors = new Map<string, string>();
  const add = (caseId: string, message: string) => {
    if (knownCaseIds.has(caseId) && message && !errors.has(caseId)) {
      errors.set(caseId, message);
    }
  };
  const addCases = (caseIds: string[], message: string) => {
    for (const caseId of caseIds) {
      add(caseId, message);
    }
  };
  const findModuleCaseIds = (
    file: TestRunResult['files'][number],
  ): string[] => {
    for (const key of [file.name, file.testPath]) {
      if (!key) continue;
      const matched = project.modules.find(
        (item) => key === item.id || key.includes(item.id),
      );
      if (matched) return matched.caseIds;
    }
    return [];
  };
  const metadataCaseIds = (
    testResult: TestRunResult['files'][number]['results'][number],
  ): string[] => {
    const value = testResult.meta?.[RSTEST_YAML_CASE_IDS_META_KEY];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  };

  for (const file of result.files ?? []) {
    const moduleCaseIds = findModuleCaseIds(file);
    for (const error of file.errors ?? []) {
      addCases(moduleCaseIds, errorMessage(error));
    }
    for (const testResult of file.results ?? []) {
      const caseIds = metadataCaseIds(testResult);
      for (const error of testResult.errors ?? []) {
        addCases(caseIds.length ? caseIds : moduleCaseIds, errorMessage(error));
      }
    }
  }

  // With one generated module, a worker/config failure belongs to cases that
  // have not already persisted a result. Preserve completed case results, but
  // let the unhandled error replace broad module-level attribution for pending
  // cases so a later worker crash is not reported as merely "not executed".
  if (project.modules.length === 1 && result.unhandledErrors?.length) {
    const message = errorMessage(result.unhandledErrors[0]);
    for (const caseId of project.modules[0].caseIds) {
      const item = casesById.get(caseId);
      if (!errors.has(caseId) || (item && !existsSync(item.resultFile))) {
        errors.set(caseId, message);
      }
    }
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
    const error = caseErrors.get(item.caseId);
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
    include: project.modules.map((item) => item.id),
    testEnvironment: 'node',
    testTimeout: project.testTimeout,
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    ...(maxConcurrency !== undefined
      ? { pool: { maxWorkers: maxConcurrency } }
      : {}),
    ...(project.bail !== undefined ? { bail: project.bail } : {}),
    ...(project.retry !== undefined && project.retry > 0
      ? { retry: project.retry }
      : {}),
    reporters: options.stdio === 'pipe' ? [] : [createYamlProgressReporter()],
    tools: {
      rspack: (_config, { appendPlugins }) => {
        appendPlugins(
          new rspack.experiments.VirtualModulesPlugin(
            Object.fromEntries(
              project.modules.map((item) => [item.id, item.source]),
            ),
          ),
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
