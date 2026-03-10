import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getSystemChromePath,
  resolveChromePath,
} from '../../src/mcp/chrome-path';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../src/env', () => ({
  MIDSCENE_MCP_CHROME_PATH: 'MIDSCENE_MCP_CHROME_PATH',
  globalConfigManager: {
    getEnvConfigValue: vi.fn(),
  },
}));

describe('Chrome Path Resolution', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  describe('getSystemChromePath', () => {
    test('should return macOS Chrome path', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const macPath =
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      vi.mocked(existsSync).mockImplementation((path) => path === macPath);

      expect(getSystemChromePath()).toBe(macPath);
    });

    test('should prefer /opt/google/chrome/chrome on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const optPath = '/opt/google/chrome/chrome';
      const usrPath = '/usr/bin/google-chrome';
      vi.mocked(existsSync).mockImplementation(
        (path) => path === optPath || path === usrPath,
      );

      expect(getSystemChromePath()).toBe(optPath);
    });

    test('should fallback to /usr/bin paths on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const linuxPath = '/usr/bin/google-chrome';
      vi.mocked(existsSync).mockImplementation((path) => path === linuxPath);

      expect(getSystemChromePath()).toBe(linuxPath);
    });

    test('should return Windows Chrome path', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const winPath =
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      vi.mocked(existsSync).mockImplementation((path) => path === winPath);

      expect(getSystemChromePath()).toBe(winPath);
    });

    test('should return undefined when no Chrome found', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getSystemChromePath()).toBeUndefined();
    });
  });

  describe('resolveChromePath', () => {
    test('should return env chrome path when valid', async () => {
      const envModule = await import('../../src/env');
      const customPath = '/custom/chrome/path';
      vi.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue(customPath);
      vi.mocked(existsSync).mockReturnValue(true);

      expect(resolveChromePath()).toBe(customPath);
    });

    test('should fallback to system path when env is auto', async () => {
      const envModule = await import('../../src/env');
      vi.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue('auto');

      expect(() => resolveChromePath()).toThrow('Chrome not found');
    });

    test('should throw when no Chrome found', async () => {
      const envModule = await import('../../src/env');
      vi.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue(undefined);

      expect(() => resolveChromePath()).toThrow('Chrome not found');
    });
  });
});
