import { existsSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from '@rstest/core';
import {
  getSystemChromePath,
  resolveChromePath,
} from '../../src/agent-tools/chrome-path';

rs.mock('node:fs', () => ({
  existsSync: rs.fn(),
}));

rs.mock('../../src/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
}));

rs.mock('../../src/env', () => ({
  MIDSCENE_CHROME_PATH: 'MIDSCENE_CHROME_PATH',
  MIDSCENE_MCP_CHROME_PATH: 'MIDSCENE_MCP_CHROME_PATH',
  globalConfigManager: {
    getEnvConfigValue: rs.fn(),
  },
}));

describe('Chrome Path Resolution', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(existsSync).mockReturnValue(false);
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
      rs.mocked(existsSync).mockImplementation((path) => path === macPath);

      expect(getSystemChromePath()).toBe(macPath);
    });

    test('should prefer /opt/google/chrome/chrome on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const optPath = '/opt/google/chrome/chrome';
      const usrPath = '/usr/bin/google-chrome';
      rs.mocked(existsSync).mockImplementation(
        (path) => path === optPath || path === usrPath,
      );

      expect(getSystemChromePath()).toBe(optPath);
    });

    test('should fallback to /usr/bin paths on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const linuxPath = '/usr/bin/google-chrome';
      rs.mocked(existsSync).mockImplementation((path) => path === linuxPath);

      expect(getSystemChromePath()).toBe(linuxPath);
    });

    test('should return Windows Chrome path', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const winPath =
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      rs.mocked(existsSync).mockImplementation((path) => path === winPath);

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
      rs.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockImplementation((key) =>
        key === 'MIDSCENE_CHROME_PATH' ? customPath : undefined,
      );
      rs.mocked(existsSync).mockReturnValue(true);

      expect(resolveChromePath()).toBe(customPath);
    });

    test('should fallback to legacy MCP chrome path when primary env is unset', async () => {
      const consoleWarnSpy = rs
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const envModule = await import('../../src/env');
      const legacyPath = '/legacy/chrome/path';
      rs.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockImplementation((key) =>
        key === 'MIDSCENE_MCP_CHROME_PATH' ? legacyPath : undefined,
      );
      rs.mocked(existsSync).mockReturnValue(true);

      expect(resolveChromePath()).toBe(legacyPath);
      consoleWarnSpy.mockRestore();
    });

    test('should fallback to system path when env is auto', async () => {
      const envModule = await import('../../src/env');
      rs.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockImplementation((key) =>
        key === 'MIDSCENE_CHROME_PATH' ? 'auto' : undefined,
      );

      expect(() => resolveChromePath()).toThrow('Chrome not found');
    });

    test('should throw when no Chrome found', async () => {
      const envModule = await import('../../src/env');
      rs.mocked(
        envModule.globalConfigManager.getEnvConfigValue,
      ).mockReturnValue(undefined);

      expect(() => resolveChromePath()).toThrow('Chrome not found');
    });
  });
});
