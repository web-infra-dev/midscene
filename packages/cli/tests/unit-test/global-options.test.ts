import {
  type Platform,
  VALID_PLATFORMS,
  addGlobalOptions,
} from '@/global-options';
import { describe, expect, test } from 'vitest';
import yargs from 'yargs/yargs';

describe('global-options', () => {
  describe('VALID_PLATFORMS', () => {
    test('should contain all expected platforms', () => {
      expect(VALID_PLATFORMS).toEqual(['web', 'computer', 'android', 'ios']);
    });

    test('should have correct length', () => {
      expect(VALID_PLATFORMS).toHaveLength(4);
    });
  });

  describe('addGlobalOptions', () => {
    test('should add platform option to yargs', async () => {
      const cli = yargs([]);
      const result = addGlobalOptions(cli);
      const argv = await result.parse(['-p', 'computer']);

      expect(argv.platform).toBe('computer');
    });

    test('should have web as default platform', async () => {
      const cli = yargs([]);
      const result = addGlobalOptions(cli);
      const argv = await result.parse([]);

      expect(argv.platform).toBe('web');
    });

    test('should accept all valid platforms', async () => {
      for (const platform of VALID_PLATFORMS) {
        const cli = yargs([]);
        const result = addGlobalOptions(cli);
        const argv = await result.parse(['-p', platform]);
        expect(argv.platform).toBe(platform);
      }
    });
  });
});
