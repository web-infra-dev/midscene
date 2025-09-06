import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  consoleLogs,
  handleListResources,
  handleReadResource,
  notifyConsoleLogsUpdated,
  notifyMessage,
  notifyResourceListChanged,
  notifyScreenshotUpdated,
  screenshots,
} from '../src/resources';
import { tools } from '../src/tools';
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

describe('Resources Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear arrays
    consoleLogs.length = 0;
    screenshots.clear();
  });

  describe('notification functions', () => {
    test('notifyResourceListChanged should send correct notification', () => {
      notifyResourceListChanged(mockServer);

      expect(mockServer.notification).toHaveBeenCalledWith({
        method: 'notifications/resources/list_changed',
      });
    });

    test('notifyConsoleLogsUpdated should send correct notification', () => {
      notifyConsoleLogsUpdated(mockServer);

      expect(mockServer.notification).toHaveBeenCalledWith({
        method: 'notifications/resources/updated',
        params: { uri: 'console://logs' },
      });
    });

    test('notifyScreenshotUpdated should send correct notification', () => {
      notifyScreenshotUpdated(mockServer);

      expect(mockServer.notification).toHaveBeenCalledWith({
        method: 'notifications/resources/updated',
        params: { uri: 'screenshot://' },
      });
    });

    test('notifyMessage should send message notification', () => {
      notifyMessage(mockServer, 'info', 'test message');

      expect(mockServer.notification).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: {
          level: 'info',
          logger: 'midscene',
          data: 'test message',
        },
      });
    });

    test('notifyMessage should include data when provided', () => {
      const testData = { key: 'value' };
      notifyMessage(mockServer, 'debug', 'test message', testData);

      expect(mockServer.notification).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: {
          level: 'debug',
          logger: 'midscene',
          data: 'test message: {"key":"value"}',
        },
      });
    });
  });

  describe('resource handlers', () => {
    test('handleListResources should return console logs and screenshots', async () => {
      consoleLogs.push('test log 1', 'test log 2');
      screenshots.set('test1', 'base64data1');
      screenshots.set('test2', 'base64data2');

      const result = await handleListResources();

      expect(result.resources).toHaveLength(3); // 1 console + 2 screenshots
      expect(result.resources[0]).toEqual({
        uri: 'console://logs',
        mimeType: 'text/plain',
        name: 'Browser console logs',
      });
      expect(result.resources[1]).toEqual({
        uri: 'screenshot://test1',
        mimeType: 'image/png',
        name: 'Screenshot: test1',
      });
    });

    test('handleReadResource should return console logs', async () => {
      consoleLogs.push('log1', 'log2', 'log3');

      const request = { params: { uri: 'console://logs' } } as any;
      const result = await handleReadResource(request);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toEqual({
        uri: 'console://logs',
        mimeType: 'text/plain',
        text: 'log1\nlog2\nlog3',
      });
    });

    test('handleReadResource should return screenshot data', async () => {
      const screenshotData = 'base64imagedata';
      screenshots.set('testshot', screenshotData);

      const request = { params: { uri: 'screenshot://testshot' } } as any;
      const result = await handleReadResource(request);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toEqual({
        uri: 'screenshot://testshot',
        mimeType: 'image/png',
        blob: screenshotData,
      });
    });

    test('handleReadResource should throw error for unknown resource', async () => {
      const request = { params: { uri: 'unknown://resource' } } as any;

      await expect(handleReadResource(request)).rejects.toThrow(
        'Resource not found: unknown://resource',
      );
    });

    test('handleReadResource should throw error for non-existent screenshot', async () => {
      const request = { params: { uri: 'screenshot://nonexistent' } } as any;

      await expect(handleReadResource(request)).rejects.toThrow(
        'Resource not found: screenshot://nonexistent',
      );
    });
  });
});

describe('Tools Module', () => {
  test('should have all expected tools defined', () => {
    const expectedTools = [
      'midscene_playwright_example',
      'midscene_navigate',
      'midscene_get_console_logs',
      'midscene_get_screenshot',
      'midscene_get_tabs',
      'midscene_set_active_tab',
      'midscene_aiHover',
      'midscene_aiWaitFor',
      'midscene_aiAssert',
      'midscene_aiKeyboardPress',
      'midscene_screenshot',
      'midscene_aiTap',
      'midscene_aiScroll',
      'midscene_aiInput',
      'midscene_android_connect',
      'midscene_android_launch',
      'midscene_android_list_devices',
      'midscene_android_back',
      'midscene_android_home',
    ];

    expectedTools.forEach((toolName) => {
      expect((tools as any)[toolName]).toBeDefined();
      expect((tools as any)[toolName].name).toBe(toolName);
      expect((tools as any)[toolName].description).toBeTruthy();
    });
  });

  test('web-specific tools should have correct properties', () => {
    expect(tools.midscene_navigate.name).toBe('midscene_navigate');
    expect(tools.midscene_navigate.description).toContain('browser');

    expect(tools.midscene_get_console_logs.inputSchema).toBeDefined();
    expect(
      tools.midscene_get_console_logs.inputSchema.properties.msgType.enum,
    ).toContain('error');

    expect(tools.midscene_get_screenshot.inputSchema.required).toContain(
      'name',
    );
  });

  test('android-specific tools should have correct names', () => {
    expect(tools.midscene_android_connect.description).toContain('Android');
    expect(tools.midscene_android_launch.description).toContain('application');
    expect(tools.midscene_android_list_devices.description).toContain(
      'devices',
    );
  });
});
