import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import type { MidsceneFrameworkConfig } from './types';

export interface LoadedDotenvFile {
  path: string;
  loaded: boolean;
}

const toAbsolutePath = (cwd: string, candidate: string): string =>
  resolve(cwd, candidate);

const dedupePaths = (paths: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
};

/**
 * Resolve the ordered list of `.env` files to consider for a suite run.
 * Defaults to `[<cwd>/.env, <configDir>/.env]` so a project can keep its env
 * either next to the config or at the working directory it was invoked from.
 * Explicit `env.path` overrides the default lookup entirely.
 */
export function resolveDotenvCandidates(input: {
  cwd: string;
  configDir: string;
  envConfig?: MidsceneFrameworkConfig['env'];
}): string[] {
  const { cwd, configDir, envConfig } = input;

  if (envConfig?.path) {
    const list = Array.isArray(envConfig.path)
      ? envConfig.path
      : [envConfig.path];
    return dedupePaths(list.map((entry) => toAbsolutePath(cwd, entry)));
  }

  return dedupePaths([
    toAbsolutePath(cwd, '.env'),
    toAbsolutePath(configDir, '.env'),
  ]);
}

/**
 * Load `.env` files for a suite run. Mirrors `@midscene/cli` semantics:
 * existing `process.env` values are preserved unless `override` is set, and
 * missing files are skipped silently so a project without a `.env` keeps
 * working. Returns the considered files so the caller can log what was
 * actually applied.
 */
export function loadFrameworkDotenv(input: {
  cwd: string;
  configDir: string;
  envConfig?: MidsceneFrameworkConfig['env'];
}): LoadedDotenvFile[] {
  if (input.envConfig?.enabled === false) {
    return [];
  }

  const candidates = resolveDotenvCandidates(input);
  const override = input.envConfig?.override === true;
  const debug = input.envConfig?.debug === true;

  return candidates.map((path) => {
    if (!existsSync(path)) {
      return { path, loaded: false };
    }
    dotenv.config({ path, override, debug });
    return { path, loaded: true };
  });
}
