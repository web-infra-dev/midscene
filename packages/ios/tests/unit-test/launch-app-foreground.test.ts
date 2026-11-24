import { describe, expect, it, rs } from '@rstest/core';

/**
 * Regression tests for iOS launch false-timeout (issue: WDA `/wda/apps/launch`
 * blocks on XCTest quiescence, which self-rendered apps never satisfy).
 *
 * 1. createSession must opt out of the quiescence wait so launch returns
 *    immediately instead of hanging ~30s.
 * 2. launchApp must then confirm the app reached the foreground via
 *    `/wda/activeAppInfo`, so a fast launch response is not a false positive.
 */
describe('IOSWebDriverClient launch quiescence', () => {
  it('createSession disables the WDA quiescence wait', async () => {
    const { IOSWebDriverClient } = await import(
      '../../src/ios-webdriver-client'
    );
    const client = new IOSWebDriverClient({ port: 8100, host: 'localhost' });

    const makeRequestSpy = rs
      .spyOn(client as any, 'makeRequest')
      .mockResolvedValue({
        sessionId: 'fake-session-id',
        value: { sessionId: 'fake-session-id' },
      });

    await client.createSession();

    expect(makeRequestSpy).toHaveBeenCalledWith(
      'POST',
      '/session',
      expect.objectContaining({
        capabilities: expect.objectContaining({
          alwaysMatch: expect.objectContaining({
            waitForQuiescence: false,
          }),
        }),
      }),
    );
  });

  it('launchApp issues the launch then confirms foreground bundle id', async () => {
    const { IOSWebDriverClient } = await import(
      '../../src/ios-webdriver-client'
    );
    const client = new IOSWebDriverClient({ port: 8100, host: 'localhost' });
    (client as any).sessionId = 'fake-session-id';

    const makeRequestSpy = rs
      .spyOn(client as any, 'makeRequest')
      .mockResolvedValue({ value: { bundleId: 'com.example.app' } });

    await client.launchApp('com.example.app');

    expect(makeRequestSpy).toHaveBeenCalledWith(
      'POST',
      '/session/fake-session-id/wda/apps/launch',
      { bundleId: 'com.example.app' },
    );
    expect(makeRequestSpy).toHaveBeenCalledWith(
      'GET',
      '/session/fake-session-id/wda/activeAppInfo',
    );
  });
});
