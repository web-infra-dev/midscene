/**
 * Programmatic Rstest invocation. Registers the generated virtual modules with
 * Rstest's bundler and runs them. Mirrors `@midscene/cli`'s
 * `framework/rstest-runner.ts` so both packages drive Rstest identically.
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
import type { GeneratedRstestProject } from './project';

export interface RunRstestProjectOptions {
  project: GeneratedRstestProject;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
}

const requireFromCliEntry = (): NodeRequire => {
  const entry = process.argv[1]
    ? resolve(process.argv[1])
    : join(process.cwd(), 'midscene-tf.js');
  return createRequire(entry);
};

const resolvePackageFromRstestCore = (packageName: string): string => {
  const require = requireFromCliEntry();
  const rstestPackageJsonPath = require.resolve('@rstest/core/package.json');
  return createRequire(rstestPackageJsonPath).resolve(packageName);
};

const formatRunError = (
  error: TestRunResult['unhandledErrors'][number],
): string => error.stack || `${error.name}: ${error.message}`;

export async function runRstestProject(
  options: RunRstestProjectOptions,
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
    ...(project.retry !== undefined ? { retry: project.retry } : {}),
    reporters: [],
    tools: {
      rspack: (config, { appendPlugins }) => {
        // The general agent (Pi) and its `@earendil-works/pi-ai` dependency are
        // ESM-only (their package `exports` expose just the `import` condition).
        // Add `import` to the resolver conditions so the worker bundle can
        // resolve them; without it rspack errors with "No exports main defined".
        config.resolve = config.resolve || {};
        config.resolve.conditionNames = [
          'import',
          'require',
          'node',
          'default',
        ];
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

  if (!result.ok && options.stdio !== 'pipe' && result.unhandledErrors.length) {
    console.error(
      result.unhandledErrors.map((error) => formatRunError(error)).join('\n'),
    );
  }

  return result.ok ? 0 : 1;
}
