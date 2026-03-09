import { describe, expect, it, vi } from 'vitest';

/**
 * Regression test: executeRequest must auto-prepend /session/{id} to the endpoint.
 *
 * Previously executeRequest passed the endpoint as-is to makeRequest,
 * resulting in requests like `http://localhost:8100/wda/apps/launch` (404)
 * instead of `http://localhost:8100/session/{id}/wda/apps/launch`.
 */
describe('IOSWebDriverClient.executeRequest session prefix', () => {
  it('should prepend /session/{id} to endpoint that lacks the prefix', async () => {
    const { IOSWebDriverClient } = await import(
      '../../src/ios-webdriver-client'
    );
    const client = new IOSWebDriverClient({
      port: 8100,
      host: 'localhost',
    });

    // Set a fake session id
    (client as any).sessionId = 'fake-session-id';

    // Spy on the underlying makeRequest to capture the actual endpoint
    const makeRequestSpy = vi
      .spyOn(client as any, 'makeRequest')
      .mockResolvedValue({ value: { success: true } });

    await client.executeRequest('POST', '/wda/apps/launch', {
      bundleId: 'com.example.app',
    });

    expect(makeRequestSpy).toHaveBeenCalledWith(
      'POST',
      '/session/fake-session-id/wda/apps/launch',
      { bundleId: 'com.example.app' },
    );
  });

  it('should not double-prepend when endpoint already includes /session/', async () => {
    const { IOSWebDriverClient } = await import(
      '../../src/ios-webdriver-client'
    );
    const client = new IOSWebDriverClient({
      port: 8100,
      host: 'localhost',
    });

    (client as any).sessionId = 'fake-session-id';

    const makeRequestSpy = vi
      .spyOn(client as any, 'makeRequest')
      .mockResolvedValue({ value: { ok: true } });

    await client.executeRequest('GET', '/session/fake-session-id/wda/screen');

    expect(makeRequestSpy).toHaveBeenCalledWith(
      'GET',
      '/session/fake-session-id/wda/screen',
      undefined,
    );
  });

  it('should throw when no session exists', async () => {
    const { IOSWebDriverClient } = await import(
      '../../src/ios-webdriver-client'
    );
    const client = new IOSWebDriverClient({
      port: 8100,
      host: 'localhost',
    });

    // No session set
    await expect(client.executeRequest('GET', '/wda/screen')).rejects.toThrow(
      'No active WebDriver session',
    );
  });
});
