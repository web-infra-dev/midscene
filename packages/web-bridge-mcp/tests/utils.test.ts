import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  deepMerge,
  getChromePathFromEnv,
  getSystemChromePath,
} from '../src/utils';

// Mock external dependencies
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('@midscene/shared/env', () => ({
  MIDSCENE_MCP_CHROME_PATH: 'MIDSCENE_MCP_CHROME_PATH',
  globalConfigManager: {
    getEnvConfigValue: vi.fn(),
  },
}));

// Mock server for notifications
const mockServer = {
  notification: vi.fn(),
} as any;

describe('Utils Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deepMerge', () => {
    test('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('should merge nested objects', () => {
      const target = { nested: { a: 1, b: 2 }, other: 'value' };
      const source = { nested: { b: 3, c: 4 } };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        nested: { a: 1, b: 3, c: 4 },
        other: 'value',
      });
    });

    test('should handle arrays with deduplication for args', () => {
      const target = { args: ['--flag1=value1', '--flag2'] };
      const source = { args: ['--flag1=newvalue', '--flag3'] };
      const result = deepMerge(target, source);

      expect(result.args).toContain('--flag1=newvalue');
      expect(result.args).toContain('--flag2');
      expect(result.args).toContain('--flag3');
      expect(result.args).not.toContain('--flag1=value1');
    });

    test('should handle non-object inputs', () => {
      expect(deepMerge('string', 'newstring')).toBe('newstring');
      expect(deepMerge({ a: 1 }, 'string')).toBe('string');
      expect(deepMerge({ a: 1 }, undefined)).toBe(undefined);
      // Note: deepMerge with null as target is not supported in current implementation
    });
  });

  describe('getSystemChromePath', () => {
    const originalPlatform = process.platform;
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      vi.mocked(existsSync).mockReturnValue(false);
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
      });
      process.env = originalEnv;
    });

    test('should return Docker Chrome path when in Docker', () => {
      process.env.DOCKER_CONTAINER = 'true';
      process.env.MIDSCENE_MCP_CHROME_PATH = '/docker/chrome';
      vi.mocked(existsSync).mockReturnValue(true);

      const result = getSystemChromePath();
      expect(result).toBe('/docker/chrome');
    });

    test('should return macOS Chrome path', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const macPath =
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      vi.mocked(existsSync).mockImplementation((path) => path === macPath);

      const result = getSystemChromePath();
      expect(result).toBe(macPath);
    });

    test('should return Linux Chrome path', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const linuxPath = '/usr/bin/google-chrome';
      vi.mocked(existsSync).mockImplementation((path) => path === linuxPath);

      const result = getSystemChromePath();
      expect(result).toBe(linuxPath);
    });

    test('should return Windows Chrome path', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const winPath =
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      vi.mocked(existsSync).mockImplementation((path) => path === winPath);

      const result = getSystemChromePath();
      expect(result).toBe(winPath);
    });

    test('should return undefined when no Chrome found', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getSystemChromePath();
      expect(result).toBeUndefined();
    });
  });

  describe('getChromePathFromEnv', () => {
    beforeEach(async () => {
      const envModule = await import('@midscene/shared/env');
      vi.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue(undefined);
      vi.mocked(existsSync).mockReturnValue(false);
    });

    test('should return env chrome path when valid', async () => {
      const envModule = await import('@midscene/shared/env');
      const customPath = '/custom/chrome/path';
      vi.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue(customPath);
      vi.mocked(existsSync).mockReturnValue(true);

      const result = getChromePathFromEnv();
      expect(result).toBe(customPath);
    });

    test('should fallback to system path when env is auto', async () => {
      const envModule = await import('@midscene/shared/env');
      vi.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue('auto');

      const result = getChromePathFromEnv();
      expect(result).toBeUndefined(); // Since existsSync is mocked to return false
    });

    test('should fallback to system path when env path does not exist', async () => {
      const envModule = await import('@midscene/shared/env');
      vi.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue('/nonexistent/path');
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getChromePathFromEnv();
      expect(result).toBeUndefined();
    });
  });
});
