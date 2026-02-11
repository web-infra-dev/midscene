import {
  type GlobalOptions,
  type Platform,
  VALID_PLATFORMS,
  addGlobalOptions,
  resolveGlobalOptions,
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
    test('should add all global options to yargs', async () => {
      const cli = yargs([]);
      const result = addGlobalOptions(cli);
      const argv = await result.parse([
        '-p', 'computer',
        '-t', 'staging',
        '--timeout', '5000',
        '--log', 'debug',
        '--json',
        '--no-auto-connect',
      ]);

      expect(argv.platform).toBe('computer');
      expect(argv.target).toBe('staging');
      expect(argv.timeout).toBe(5000);
      expect(argv.log).toBe('debug');
      expect(argv.json).toBe(true);
      // yargs interprets --no-auto-connect as negation of auto-connect
      expect(argv.autoConnect).toBe(false);
    });

    test('should have web as default platform', async () => {
      const cli = yargs([]);
      const result = addGlobalOptions(cli);
      const argv = await result.parse([]);

      expect(argv.platform).toBe('web');
    });

    test('should default json to false', async () => {
      const cli = yargs([]);
      const result = addGlobalOptions(cli);
      const argv = await result.parse([]);

      expect(argv.json).toBe(false);
    });
  });

  describe('resolveGlobalOptions', () => {
    test('should resolve all options from argv', () => {
      // Simulate yargs behavior: --no-auto-connect sets autoConnect: false
      const opts = resolveGlobalOptions({
        platform: 'android',
        target: 'my-device',
        timeout: 10000,
        log: 'warn',
        json: true,
        autoConnect: false,
      });

      expect(opts).toEqual({
        platform: 'android',
        target: 'my-device',
        timeout: 10000,
        log: 'warn',
        json: true,
        noAutoConnect: true,
      });
    });

    test('should use defaults for missing values', () => {
      const opts = resolveGlobalOptions({});

      expect(opts.platform).toBe('web');
      expect(opts.target).toBeUndefined();
      expect(opts.timeout).toBeUndefined();
      expect(opts.log).toBeUndefined();
      expect(opts.json).toBe(false);
      expect(opts.noAutoConnect).toBe(false);
    });

    test('should handle partial options', () => {
      const opts = resolveGlobalOptions({
        platform: 'ios',
        json: true,
      });

      expect(opts.platform).toBe('ios');
      expect(opts.json).toBe(true);
      expect(opts.noAutoConnect).toBe(false);
    });
  });
});
