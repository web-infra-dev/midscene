import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const entries = [
  ['@midscene/core/agent/test', 'commonAgentTestRunnerNodeDefinitions'],
  ['@midscene/web/playwright/test', 'playwrightAgentTestRunnerNodeDefinitions'],
  ['@midscene/android/test', 'androidAgentTestRunnerNodeDefinitions'],
  ['@midscene/ios/test', 'iosAgentTestRunnerNodeDefinitions'],
  ['@midscene/harmony/test', 'harmonyAgentTestRunnerNodeDefinitions'],
] as const;

describe('platform test public entries', () => {
  it.each(['android', 'ios', 'harmony', 'playwright'])(
    'does not expose the removed %s factory entry',
    (platform) => {
      expect(() => require.resolve(`@midscene/test/${platform}`)).toThrow(
        expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
      );
    },
  );
  it.each(entries)(
    '%s supports ESM and CommonJS without the old alias',
    async (entry, exportedName) => {
      expect(await import(entry)).toHaveProperty(exportedName);
      expect(require(entry)).toHaveProperty(exportedName);
      expect(() => require.resolve(`${entry}-runner`)).toThrow(
        expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
      );
    },
  );
});
