import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);
export const packageRoot = resolve(__dirname, '../..');
export const cliPath = join(packageRoot, 'bin', 'midscene-test');

interface FailedExecution {
  code: number;
  stdout: string;
  stderr: string;
}

export const runDirFor = (resultDir: string): string => {
  const runIds = readdirSync(resultDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && /^\d{14}-[0-9a-f]{8}$/.test(entry.name),
    )
    .map((entry) => entry.name);
  if (runIds.length !== 1) {
    throw new Error(
      `Expected one run directory in ${resultDir}, found ${runIds.length}.`,
    );
  }
  return join(resultDir, runIds[0]);
};

export const summaryPathFor = (resultDir: string) =>
  join(runDirFor(resultDir), 'summary.json');

export const runFailure = async (
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = packageRoot,
): Promise<FailedExecution> => {
  try {
    await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd,
      env,
    });
  } catch (error) {
    return error as FailedExecution;
  }
  throw new Error('Expected test CLI to fail.');
};
