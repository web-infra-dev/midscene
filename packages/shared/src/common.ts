import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { isAbsolute } from 'node:path';
import { MIDSCENE_REPORT_RUN_DIR, MIDSCENE_USE_REPORT_TMP_DIR } from './env';
import { getAIConfig } from './env';

export const defaultRunDirName = 'midscene_run';
// Define locally for now to avoid import issues
export const isNodeEnv =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

export const getMidsceneRunDir = () => {
  if (!isNodeEnv) {
    return '';
  }

  return getAIConfig(MIDSCENE_REPORT_RUN_DIR) || defaultRunDirName;
};

export const getMidsceneRunBaseDir = () => {
  if (!isNodeEnv) {
    return '';
  }

  let basePath;

  if (isAbsolute(getMidsceneRunDir())) {
    basePath = getMidsceneRunDir();
  } else if (getAIConfig(MIDSCENE_USE_REPORT_TMP_DIR)) {
    basePath = path.join(tmpdir(), getMidsceneRunDir());
  } else {
    basePath = path.join(process.cwd(), defaultRunDirName);
  }

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
  if (!isNodeEnv) {
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

export const logDir = isNodeEnv ? getMidsceneRunSubDir('log') : '';
