/**
 * Config authoring + loading for @midscene/bdd.
 *
 * - `defineBddConfig` — identity helper with eager validation so authors get
 *   errors at config-definition time.
 * - `loadBddConfig` — locates and loads `midscene.config.ts` (via jiti, so
 *   TypeScript configs work at runtime) and returns a `ResolvedBddConfig`
 *   with defaults applied.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import type { BddConfig, ResolvedBddConfig } from './types';
import { ERROR_PREFIX } from './types';

const CONFIG_ERROR_PREFIX = `${ERROR_PREFIX} midscene.config.ts:`;

function configError(message: string): Error {
  return new Error(`${CONFIG_ERROR_PREFIX} ${message}`);
}

function validateBddConfig(config: unknown): asserts config is BddConfig {
  if (typeof config !== 'object' || config === null) {
    throw configError(
      `config must be an object created with defineBddConfig({ ... }), got ${typeof config}`,
    );
  }
  const cfg = config as Record<string, unknown>;

  const uiAgent = cfg.uiAgent;
  if (uiAgent === undefined || uiAgent === null) {
    throw configError(
      `uiAgent is required — provide a factory function or { type: 'web', url: '...' }`,
    );
  }
  if (typeof uiAgent !== 'function') {
    if (typeof uiAgent !== 'object') {
      throw configError(
        `uiAgent must be a function or { type: 'web', url: '...' }, got ${typeof uiAgent}`,
      );
    }
    const target = uiAgent as Record<string, unknown>;
    if (target.type !== 'web') {
      throw configError(
        `uiAgent.type '${String(target.type)}' is unknown — only 'web' is supported (or pass a factory function)`,
      );
    }
    if (typeof target.url !== 'string' || target.url.length === 0) {
      throw configError('uiAgent.url must be a non-empty string');
    }
  }

  const paths = cfg.paths as Record<string, unknown> | undefined;
  if (paths !== undefined) {
    if (typeof paths !== 'object' || paths === null) {
      throw configError('paths must be an object');
    }
    if (paths.features !== undefined) {
      const features = paths.features;
      if (
        !Array.isArray(features) ||
        features.length === 0 ||
        features.some((f) => typeof f !== 'string' || f.length === 0)
      ) {
        throw configError(
          'paths.features must be a non-empty array of glob strings',
        );
      }
    }
    if (paths.skills !== undefined && typeof paths.skills !== 'string') {
      throw configError('paths.skills must be a string');
    }
  }

  const generalAgent = cfg.generalAgent as Record<string, unknown> | undefined;
  if (generalAgent !== undefined) {
    if (typeof generalAgent !== 'object' || generalAgent === null) {
      throw configError('generalAgent must be an object');
    }
    if (generalAgent.modelEnv !== undefined) {
      throw configError(
        "generalAgent.modelEnv was removed — the general agent is now a CLI coding agent (opencode/codex). Use generalAgent.env to pass env vars to the spawned CLI, generalAgent.model to override the model, or generalAgent.type: 'codex' to switch CLIs.",
      );
    }
    if (
      generalAgent.type !== undefined &&
      generalAgent.type !== 'opencode' &&
      generalAgent.type !== 'codex'
    ) {
      throw configError(
        `generalAgent.type '${String(generalAgent.type)}' is unknown — use 'opencode' (default) or 'codex'`,
      );
    }
    if (
      generalAgent.model !== undefined &&
      (typeof generalAgent.model !== 'string' ||
        generalAgent.model.length === 0)
    ) {
      throw configError('generalAgent.model must be a non-empty string');
    }
    if (generalAgent.env !== undefined) {
      const env = generalAgent.env;
      if (
        typeof env !== 'object' ||
        env === null ||
        Object.values(env).some((v) => typeof v !== 'string')
      ) {
        throw configError('generalAgent.env must be a record of string values');
      }
    }
    if (
      generalAgent.cwd !== undefined &&
      (typeof generalAgent.cwd !== 'string' || generalAgent.cwd.length === 0)
    ) {
      throw configError('generalAgent.cwd must be a non-empty string');
    }
    if (generalAgent.timeoutMs !== undefined) {
      const timeoutMs = generalAgent.timeoutMs;
      if (
        typeof timeoutMs !== 'number' ||
        !Number.isFinite(timeoutMs) ||
        timeoutMs <= 0
      ) {
        throw configError(
          'generalAgent.timeoutMs must be a positive number of milliseconds',
        );
      }
    }
    if (
      generalAgent.permissions !== undefined &&
      generalAgent.permissions !== 'read-only' &&
      generalAgent.permissions !== 'workspace' &&
      generalAgent.permissions !== 'all'
    ) {
      throw configError(
        `generalAgent.permissions '${String(generalAgent.permissions)}' is unknown — use 'read-only', 'workspace' (default), or 'all'`,
      );
    }
    if (
      generalAgent.reuseMidsceneModelEnv !== undefined &&
      typeof generalAgent.reuseMidsceneModelEnv !== 'boolean'
    ) {
      throw configError('generalAgent.reuseMidsceneModelEnv must be a boolean');
    }
    if (
      generalAgent.sessionPerScenario !== undefined &&
      typeof generalAgent.sessionPerScenario !== 'boolean'
    ) {
      throw configError('generalAgent.sessionPerScenario must be a boolean');
    }
    if (
      generalAgent.factory !== undefined &&
      typeof generalAgent.factory !== 'function'
    ) {
      throw configError('generalAgent.factory must be a function');
    }
  }
}

export function defineBddConfig(config: BddConfig): BddConfig {
  validateBddConfig(config);
  return config;
}

export async function loadBddConfig(opts?: {
  cwd?: string;
  configPath?: string;
}): Promise<ResolvedBddConfig> {
  const cwd = opts?.cwd ?? process.cwd();
  const configPath = path.resolve(
    cwd,
    opts?.configPath ??
      process.env.MIDSCENE_BDD_CONFIG ??
      path.join(cwd, 'midscene.config.ts'),
  );

  if (!existsSync(configPath)) {
    throw new Error(
      `${ERROR_PREFIX} No midscene.config.ts found at ${configPath}. Create one with defineBddConfig({ uiAgent: { type: 'web', url: '...' } }).`,
    );
  }

  // __filename keeps the dual CJS/ESM rslib build free of import.meta; the
  // base only matters for relative ids and configPath is always absolute.
  // `default: true` + interopDefault already unwrap both
  // `export default defineBddConfig({...})` and `module.exports = {...}`.
  const jiti = createJiti(__filename, { interopDefault: true });
  const config = await jiti.import(configPath, { default: true });

  validateBddConfig(config);

  return {
    uiAgent: config.uiAgent,
    generalAgent: config.generalAgent ?? {},
    paths: {
      features: config.paths?.features ?? ['features/**/*.feature'],
      skills: config.paths?.skills ?? 'features/skills',
    },
    baseDir: path.dirname(configPath),
  };
}
