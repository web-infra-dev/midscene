import { workspaceRoot } from '../runtime/paths.js';
export const defaultMidsceneRepoPath = workspaceRoot;
export function resolveMidsceneRepoPath(customPath?: string): string {
  if (customPath && customPath !== workspaceRoot)
    throw new Error('This benchmark runs the current Midscene checkout');
  return workspaceRoot;
}
