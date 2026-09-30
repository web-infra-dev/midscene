import { access } from 'node:fs/promises';
import path from 'node:path';
import { collectCodeVersion } from '../runtime/collect-code-version.js';
import { workspaceRoot } from '../runtime/paths.js';

export type MidsceneRuntimeSource = {
  type: 'repo';
  repoPath: string;
  moduleEntryFile: string;
  action: 'ready';
  commitHash: string | null;
  dirtyFiles: string[];
};

export async function prepareMidsceneRuntimeSource(
  _input: { repoPath?: string } = {},
): Promise<MidsceneRuntimeSource> {
  const moduleEntryFile = path.join(
    workspaceRoot,
    'packages/core/dist/es/index.mjs',
  );
  try {
    await access(moduleEntryFile);
  } catch {
    throw new Error(
      'Build the local SDK first: pnpm exec nx build @midscene/core',
    );
  }
  const version = await collectCodeVersion(workspaceRoot);
  return {
    type: 'repo',
    repoPath: workspaceRoot,
    moduleEntryFile,
    action: 'ready',
    commitHash: version.commitHash,
    dirtyFiles: version.dirtyFiles,
  };
}
