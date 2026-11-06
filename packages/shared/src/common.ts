import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createConsoleContext } from '#console-context';
// do not import getBasicEnvValue and MIDSCENE_RUN_DIR directly from ./env,
// because it will cause circular dependency
import { getBasicEnvValue } from './env/basic';
import { MIDSCENE_RUN_DIR } from './env/types';
import { ifInNode } from './utils';

export const defaultRunDirName = 'midscene_run';
let configuredRunDir: string | undefined;
const contextKey = Symbol.for('@midscene/shared/run-directory');
const host = globalThis as typeof globalThis & {
  [contextKey]?: ReturnType<typeof createConsoleContext<string>>;
};
// Configs may load ESM SDKs while the CLI uses CJS. Share their async scope.
host[contextKey] ??= createConsoleContext<string>();
const runDirectoryContext = host[contextKey];

const validateRunDir = (value: string): string => {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError('Midscene run directory must be a non-empty path.');
  return value;
};

/**
 * Sets the run directory for the current process without changing the
 * environment. Callers that do not set it keep the existing environment-based
 * behavior.
 */
export const setMidsceneRunDir = (runDir: string | undefined): void => {
  configuredRunDir = runDir === undefined ? undefined : validateRunDir(runDir);
};

export const getMidsceneRunDir = () => {
  if (!ifInNode) {
    return '';
  }

  return validateRunDir(
    runDirectoryContext.getStore() ??
      configuredRunDir ??
      getBasicEnvValue(MIDSCENE_RUN_DIR) ??
      defaultRunDirName,
  );
};

/** Resolve Test paths against its project; standalone callers use their cwd. */
export const resolveMidsceneRunDir = (baseDir: string): string =>
  path.resolve(baseDir, validateRunDir(getMidsceneRunDir()));

/** Isolate concurrent Test runs without changing process.env or the app root. */
export const runWithMidsceneRunDir = <T>(runDir: string, run: () => T): T =>
  runDirectoryContext.run(path.resolve(validateRunDir(runDir)), run);

export const getMidsceneRunBaseDir = () => {
  if (!ifInNode) {
    return '';
  }

  const basePath = path.resolve(process.cwd(), getMidsceneRunDir());
  // A configured root is authoritative: report filesystem errors to its caller.
  mkdirSync(basePath, { recursive: true });

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
  subdir:
    | 'dump'
    | 'cache'
    | 'report'
    | 'tmp'
    | 'log'
    | 'output'
    | 'test-results',
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
