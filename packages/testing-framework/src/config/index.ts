import { getDebug } from '@midscene/shared/logger';
import type { MidsceneConfig } from './types';

const warn = getDebug('testing-framework:config', { console: true });

/**
 * Identity helper for `midscene.config.ts`, giving full type inference and a
 * stable import surface (RFC §2).
 */
export function defineMidsceneConfig(config: MidsceneConfig): MidsceneConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('[midscene] defineMidsceneConfig expects a config object.');
  }
  if (!config.uiAgent) {
    // A missing uiAgent is recoverable for some flows (e.g. cases that only use
    // custom runtime nodes), so warn instead of failing the whole config load.
    warn(
      'midscene.config.ts does not define a `uiAgent` (object or factory function); ui/verify/soft/agent nodes will have no UI Agent to run against.',
    );
  }
  if (!config.testDir) {
    throw new Error('[midscene] midscene.config.ts must define a `testDir`.');
  }
  return config;
}

export * from './types';
