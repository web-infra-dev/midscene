import { getMidsceneRunPathOfType } from './node/fs';

// Define locally for now to avoid import issues
export const isNodeEnv =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

/**
 * Get the path to the midscene_run directory or a subdirectory within it.
 * Creates the directory if it doesn't exist.
 *
 * @param subdir - Optional subdirectory name (e.g., 'log', 'report')
 * @returns The absolute path to the requested directory
 */
export const getMidsceneRunLogPath = (): string => {
  return getMidsceneRunPathOfType('log');
};

export const logDir = isNodeEnv ? getMidsceneRunLogPath() : '';
