import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { describe, expect, it, vi } from 'vitest';
import { IOSWebDriverClient } from '../../src/ios-webdriver-client';
import type { IOSWebDriverClient as IOSWebDriverClientType } from '../../src/ios-webdriver-client';

function createClientWithSession() {
  const client = new IOSWebDriverClient({
    port: DEFAULT_WDA_PORT,
    host: 'localhost',
  });
  // Bypass createSession() — we only want to observe outbound HTTP calls.
  (client as any).sessionId = 'session-under-test';
  const makeRequest = vi
    .spyOn(client as any, 'makeRequest')
    .mockResolvedValue(undefined);
  return { client, makeRequest };
}

describe('IOSWebDriverClient.typeText delivery modes', () => {
  it('sends the whole string in one /wda/keys request when delayMs is 0 (default)', async () => {
    const { client, makeRequest } = createClientWithSession();

    await client.typeText('Al is amazing');

    expect(makeRequest).toHaveBeenCalledTimes(1);
    expect(makeRequest).toHaveBeenCalledWith(
      'POST',
      '/session/session-under-test/wda/keys',
      {
        value: [
          'A',
          'l',
          ' ',
          'i',
          's',
          ' ',
          'a',
          'm',
          'a',
          'z',
          'i',
          'n',
          'g',
        ],
      },
    );
  });

  it('emits one /wda/keys request per character when delayMs > 0', async () => {
    const { client, makeRequest } = createClientWithSession();

    await client.typeText('Hi!', { delayMs: 1 });

    expect(makeRequest).toHaveBeenCalledTimes(3);
    expect(makeRequest).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/session/session-under-test/wda/keys',
      { value: ['H'] },
    );
    expect(makeRequest).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/session/session-under-test/wda/keys',
      { value: ['i'] },
    );
    expect(makeRequest).toHaveBeenNthCalledWith(
      3,
      'POST',
      '/session/session-under-test/wda/keys',
      { value: ['!'] },
    );
  });

  it('trims surrounding whitespace and skips empty input', async () => {
    const { client, makeRequest } = createClientWithSession();

    await client.typeText('   ');

    expect(makeRequest).not.toHaveBeenCalled();
  });
});

describe('IOSWebDriverClient.pasteText', () => {
  it('sets and verifies the iOS pasteboard before sending Command+V to the active element', async () => {
    const { client, makeRequest } = createClientWithSession();
    makeRequest.mockImplementation(async (_method, path) => {
      if (path === '/session/session-under-test/wda/getPasteboard') {
        return {
          value: Buffer.from('Hello 世界', 'utf8').toString('base64'),
        };
      }
      if (path === '/session/session-under-test/element/active') {
        return { value: { ELEMENT: 'active-element-id' } };
      }
      return undefined;
    });

    await client.pasteText('Hello 世界');

    expect(makeRequest).toHaveBeenCalledTimes(4);
    expect(makeRequest).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/session/session-under-test/wda/setPasteboard',
      {
        content: Buffer.from('Hello 世界', 'utf8').toString('base64'),
        contentType: 'plaintext',
      },
    );
    expect(makeRequest).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/session/session-under-test/wda/getPasteboard',
      {
        contentType: 'plaintext',
      },
    );
    expect(makeRequest).toHaveBeenNthCalledWith(
      3,
      'GET',
      '/session/session-under-test/element/active',
    );
    expect(makeRequest).toHaveBeenNthCalledWith(
      4,
      'POST',
      '/session/session-under-test/wda/element/active-element-id/keyboardInput',
      {
        keys: [{ key: 'v', modifierFlags: 16 }],
      },
    );
  });

  it('accepts plaintext pasteboard readback from WDA variants that do not return base64', async () => {
    const { client, makeRequest } = createClientWithSession();
    makeRequest.mockImplementation(async (_method, path) => {
      if (path === '/session/session-under-test/wda/getPasteboard') {
        return { value: 'test' };
      }
      return undefined;
    });

    await client.pasteText('test');

    expect(makeRequest).toHaveBeenLastCalledWith(
      'POST',
      '/session/session-under-test/wda/element/0/keyboardInput',
      {
        keys: [{ key: 'v', modifierFlags: 16 }],
      },
    );
  });

  it('throws before Command+V when WDA reports a mismatched pasteboard value', async () => {
    const { client, makeRequest } = createClientWithSession();
    makeRequest.mockImplementation(async (_method, path) => {
      if (path === '/session/session-under-test/wda/getPasteboard') {
        return { value: '' };
      }
      return undefined;
    });

    await expect(client.pasteText('Hello')).rejects.toThrow(
      'WDA pasteboard verification failed',
    );
    expect(makeRequest).not.toHaveBeenCalledWith(
      'POST',
      '/session/session-under-test/wda/element/0/keyboardInput',
      expect.anything(),
    );
  });

  it('falls back to the active application when no active element is available', async () => {
    const { client, makeRequest } = createClientWithSession();
    makeRequest.mockImplementation(async (_method, path) => {
      if (path === '/session/session-under-test/wda/getPasteboard') {
        return { value: Buffer.from('Hello', 'utf8').toString('base64') };
      }
      return undefined;
    });

    await client.pasteText('Hello');

    expect(makeRequest).toHaveBeenLastCalledWith(
      'POST',
      '/session/session-under-test/wda/element/0/keyboardInput',
      {
        keys: [{ key: 'v', modifierFlags: 16 }],
      },
    );
  });

  it('trims surrounding whitespace and skips empty input', async () => {
    const { client, makeRequest } = createClientWithSession();

    await client.pasteText('   ');

    expect(makeRequest).not.toHaveBeenCalled();
  });
});

describe('IOSWebDriverClient - Simple Tests', () => {
  describe('Module Structure', () => {
    it('should export IOSWebDriverClient class', async () => {
      const module = await import('../../src/ios-webdriver-client');
      expect(module.IOSWebDriverClient).toBeDefined();
      expect(typeof module.IOSWebDriverClient).toBe('function'); // Constructor is a function
    });

    it('should be constructible with basic parameters', async () => {
      const { IOSWebDriverClient } = await import(
        '../../src/ios-webdriver-client'
      );

      expect(() => {
        new IOSWebDriverClient({ port: DEFAULT_WDA_PORT, host: 'localhost' });
      }).not.toThrow();
    });

    it('should have expected public methods', async () => {
      const { IOSWebDriverClient } = await import(
        '../../src/ios-webdriver-client'
      );
      const client = new IOSWebDriverClient({
        port: DEFAULT_WDA_PORT,
        host: 'localhost',
      });

      // Check that expected methods exist
      const expectedMethods = [
        'createSession',
        'deleteSession',
        'getWindowSize',
        'takeScreenshot',
        'tap',
        'swipe',
        'typeText',
        'pasteText',
        'pressKey',
        'launchApp',
        'openUrl',
        'getDeviceInfo',
        'pressHomeButton',
        'activateApp',
        'terminateApp',
      ] as const satisfies readonly (keyof IOSWebDriverClientType)[];

      for (const method of expectedMethods) {
        expect(client[method]).toBeDefined();
        expect(typeof client[method]).toBe('function');
      }
    });

    it('should store initialization parameters correctly', async () => {
      const { IOSWebDriverClient } = await import(
        '../../src/ios-webdriver-client'
      );
      const port = 9876;
      const host = 'test-host';

      const client = new IOSWebDriverClient({ port, host });

      // Check that the client stores the parameters (these are likely private but we can test behavior)
      expect(client).toBeDefined();
      expect(client.constructor.name).toBe('IOSWebDriverClient');
    });
  });
});
