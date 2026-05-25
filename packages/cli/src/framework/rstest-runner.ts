import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

export interface RunRstestCliOptions {
  configFile: string;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
  extraArgs?: string[];
}

const requireFromCliEntry = () => {
  const entry = process.argv[1]
    ? resolve(process.argv[1])
    : join(process.cwd(), 'midscene-cli.js');
  return createRequire(entry);
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
