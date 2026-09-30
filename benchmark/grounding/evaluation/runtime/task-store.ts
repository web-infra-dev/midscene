import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { outputRunsDir } from './paths.js';

export async function ensureRunDir(runId: string): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(runId))
    throw new Error('runId must be a simple directory name');
  const runDir = path.join(outputRunsDir, runId);
  for (const name of ['state.json', 'results.json']) {
    try {
      await access(path.join(runDir, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Run ${runId} already has results; choose a new runId`);
  }
  await mkdir(runDir, { recursive: true });
  return runDir;
}
