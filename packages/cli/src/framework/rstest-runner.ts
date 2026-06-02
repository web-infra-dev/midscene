import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { runRstestWithVirtualModules } from '@midscene/shared/rstest';
import type { TestRunResult } from '@rstest/core/api';
import type { GeneratedRstestYamlProject } from './rstest-project';

export interface RunRstestYamlProjectOptions {
  project: GeneratedRstestYamlProject;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
}

const requireFromCliEntry = () => {
  const entry = process.argv[1]
    ? resolve(process.argv[1])
    : join(process.cwd(), 'midscene-cli.js');
  return createRequire(entry);
};

const resolvePackageFromRstestCore = (packageName: string): string => {
  const require = requireFromCliEntry();
  const rstestPackageJsonPath = require.resolve('@rstest/core/package.json');
  return createRequire(rstestPackageJsonPath).resolve(packageName);
};

export function resolveRstestCoreImportPath(): string {
  const require = requireFromCliEntry();
  const packageJsonPath = require.resolve('@rstest/core/package.json');
  return join(dirname(packageJsonPath), 'dist', 'index.js');
}

const formatRunError = (
  error: TestRunResult['unhandledErrors'][number],
): string => error.stack || `${error.name}: ${error.message}`;

export async function runRstestYamlProject(
  options: RunRstestYamlProjectOptions,
): Promise<number> {
  const { project } = options;
  // The CLI bundles its own `@rstest/core`, so `@rsbuild/core` is resolved
  // relative to it. The actual `runRstest` wiring is shared with
  // `@midscene/testing-framework` via `@midscene/shared/rstest`.
  const result = await runRstestWithVirtualModules({
    cwd: options.cwd || project.projectDir,
    root: project.projectDir,
    include: project.include,
    virtualModules: project.virtualModules,
    rsbuildEntry: resolvePackageFromRstestCore('@rsbuild/core'),
    testTimeout: project.testTimeout,
    maxConcurrency: project.maxConcurrency,
    bail: project.bail,
    reporters: [],
  });

  const unhandledErrors = (result.unhandledErrors ??
    []) as TestRunResult['unhandledErrors'];
  if (!result.ok && options.stdio !== 'pipe' && unhandledErrors.length) {
    console.error(
      unhandledErrors.map((error) => formatRunError(error)).join('\n'),
    );
  }

  return result.ok ? 0 : 1;
}
