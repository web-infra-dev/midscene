import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createJiti } from 'jiti';
import type { MidsceneConfig } from '../config/types';

const CONFIG_CANDIDATES = [
  'midscene.config.ts',
  'midscene.config.mts',
  'midscene.config.js',
  'midscene.config.mjs',
];

/** Resolve the config file path from an explicit path or a project root. */
export function resolveConfigPath(cwdOrPath: string = process.cwd()): string {
  const abs = isAbsolute(cwdOrPath) ? cwdOrPath : resolve(cwdOrPath);
  // If it points directly at a file, use it.
  if (existsSync(abs) && /\.(ts|mts|js|mjs)$/.test(abs)) {
    return abs;
  }
  for (const candidate of CONFIG_CANDIDATES) {
    const full = resolve(abs, candidate);
    if (existsSync(full)) return full;
  }
  throw new Error(
    `[midscene] Could not find midscene.config.ts in ${abs}. Looked for: ${CONFIG_CANDIDATES.join(', ')}.`,
  );
}

/**
 * Load and return the config object from a `midscene.config.*` file. Uses jiti
 * so TypeScript config works without a build step.
 */
export async function loadConfig(
  cwdOrPath?: string,
): Promise<{ config: MidsceneConfig; configPath: string }> {
  const configPath = resolveConfigPath(cwdOrPath);
  const jiti = createJiti(configPath, { interopDefault: true });
  const loaded = (await jiti.import(configPath, {
    default: true,
  })) as MidsceneConfig;

  if (!loaded || typeof loaded !== 'object') {
    throw new Error(
      `[midscene] ${configPath} must default-export a config object from defineMidsceneConfig().`,
    );
  }
  return { config: loaded, configPath };
}
