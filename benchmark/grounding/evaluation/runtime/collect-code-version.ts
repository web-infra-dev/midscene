import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CodeVersionSnapshot } from '../types.js';

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function collectCodeVersion(
  cwd: string,
): Promise<CodeVersionSnapshot> {
  const [branch, commitHash, status] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', 'HEAD'], cwd),
    runGit(['status', '--short'], cwd),
  ]);

  const dirtyFiles = (status ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    branch,
    commitHash,
    dirtyFiles,
    isDirty: dirtyFiles.length > 0,
  };
}
