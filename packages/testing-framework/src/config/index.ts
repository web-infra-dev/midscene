import type { MidsceneConfig } from './types';

/**
 * Identity helper for `midscene.config.ts`, giving full type inference and a
 * stable import surface (RFC §2).
 */
export function defineMidsceneConfig(config: MidsceneConfig): MidsceneConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('[midscene] defineMidsceneConfig expects a config object.');
  }
  if (!config.uiAgent) {
    throw new Error(
      '[midscene] midscene.config.ts must define a `uiAgent` (object or factory function).',
    );
  }
  if (!config.testDir) {
    throw new Error('[midscene] midscene.config.ts must define a `testDir`.');
  }
  return config;
}

export * from './types';
