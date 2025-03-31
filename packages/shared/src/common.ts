import fs from 'node:fs';
import path from 'node:path';

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
  const basePath = path.join(process.cwd(), 'midscene_run');

  // Create a base directory
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { recursive: true });
  }

  // Create a log directory
  const logPath = path.join(basePath, 'log');
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath, { recursive: true });
  }

  return logPath;
};

export const logDir = isNodeEnv ? getMidsceneRunLogPath() : '';
