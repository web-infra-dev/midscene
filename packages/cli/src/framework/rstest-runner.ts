import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
import type { GeneratedRstestYamlProject } from './rstest-project';

export interface RunRstestCliOptions {
  configFile: string;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
  extraArgs?: string[];
}

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

export function resolveRstestBinPath(): string {
  const require = requireFromCliEntry();
  const packageJsonPath = require.resolve('@rstest/core/package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    bin?: { rstest?: string };
  };
  const binPath = packageJson.bin?.rstest;
  if (!binPath) {
    throw new Error('@rstest/core does not expose a rstest binary');
  }
  return join(dirname(packageJsonPath), binPath);
}

export function resolveRstestCoreImportPath(): string {
  const require = requireFromCliEntry();
  const packageJsonPath = require.resolve('@rstest/core/package.json');
  return join(dirname(packageJsonPath), 'dist', 'index.js');
}

export async function runRstestCli(
  options: RunRstestCliOptions,
): Promise<number> {
  const args = [
    resolveRstestBinPath(),
    '--config',
    resolve(options.configFile),
    ...(options.extraArgs || []),
  ];

  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd || process.cwd(),
      stdio: options.stdio || 'inherit',
      env: process.env,
    });
    if (options.stdio === 'pipe') {
      child.stdout?.resume();
      child.stderr?.resume();
    }

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`Rstest was terminated by signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

const formatRunError = (
  error: TestRunResult['unhandledErrors'][number],
): string => error.stack || `${error.name}: ${error.message}`;

export async function runRstestYamlProject(
  options: RunRstestYamlProjectOptions,
): Promise<number> {
  const [{ runRstest }, { rspack }] = await Promise.all([
    import('@rstest/core/api'),
    import(pathToFileURL(resolvePackageFromRstestCore('@rsbuild/core')).href),
  ]);
  const { project } = options;
  const inlineConfig: RstestUserConfig = {
    root: project.projectDir,
    include: project.include,
    testEnvironment: 'node',
    testTimeout: project.testTimeout,
    ...(project.maxConcurrency !== undefined
      ? { maxConcurrency: project.maxConcurrency }
      : {}),
    ...(project.bail !== undefined ? { bail: project.bail } : {}),
    ...(options.stdio === 'pipe' ? { reporters: [] } : {}),
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

  if (!result.ok && options.stdio !== 'pipe' && result.unhandledErrors.length) {
    console.error(
      result.unhandledErrors.map((error) => formatRunError(error)).join('\n'),
    );
  }

  return result.ok ? 0 : 1;
}
