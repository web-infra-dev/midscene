import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { workspaceRoot } from '../runtime/paths.js';
const execFileAsync = promisify(execFile);

export async function writeMidsceneDiffAgainstMain(input: {
  repoPath?: string;
  outputPath: string;
}): Promise<{ outputPath: string }> {
  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--no-ext-diff', 'origin/main', '--', 'packages/core'],
    { cwd: input.repoPath ?? workspaceRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  await writeFile(input.outputPath, stdout);
  return { outputPath: input.outputPath };
}
