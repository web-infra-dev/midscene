import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// do not import getBasicEnvValue and MIDSCENE_RUN_DIR directly from ./env,
// because it will cause circular dependency
import { getBasicEnvValue } from './env/basic';
import { MIDSCENE_RUN_DIR } from './env/types';
import { ifInNode } from './utils';

export const defaultRunDirName = 'midscene_run';
let configuredRunDir: string | undefined;
// Define locally for now to avoid import issues

/**
 * Sets the run directory for the current process without changing the
 * environment. Callers that do not set it keep the existing environment-based
 * behavior.
 */
export const setMidsceneRunDir = (runDir: string | undefined): void => {
  configuredRunDir = runDir;
};

export const getMidsceneRunDir = () => {
  if (!ifInNode) {
    return '';
  }

  return (
    configuredRunDir ?? getBasicEnvValue(MIDSCENE_RUN_DIR) ?? defaultRunDirName
  );
};

export const getMidsceneRunBaseDir = () => {
  if (!ifInNode) {
    return '';
  }

  let basePath = path.resolve(process.cwd(), getMidsceneRunDir());

  // Create a base directory
  if (!existsSync(basePath)) {
    try {
      mkdirSync(basePath, { recursive: true });
    } catch (error) {
      // console.error(`Failed to create ${runDirName} directory: ${error}`);
      basePath = path.join(tmpdir(), defaultRunDirName);
      mkdirSync(basePath, { recursive: true });
    }
  }

  return basePath;
};

/**
 * Get the path to the midscene_run directory or a subdirectory within it.
 * Creates the directory if it doesn't exist.
 *
 * @param subdir - Optional subdirectory name (e.g., 'log', 'report')
 * @returns The absolute path to the requested directory
 */
export const getMidsceneRunSubDir = (
  subdir: 'dump' | 'cache' | 'report' | 'tmp' | 'log' | 'output',
): string => {
  if (!ifInNode) {
    return '';
  }

  // Create a log directory
  const basePath = getMidsceneRunBaseDir();
  const logPath = path.join(basePath, subdir);
  if (!existsSync(logPath)) {
    mkdirSync(logPath, { recursive: true });
  }

  return logPath;
};

export const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED =
  'NOT_IMPLEMENTED_AS_DESIGNED';
