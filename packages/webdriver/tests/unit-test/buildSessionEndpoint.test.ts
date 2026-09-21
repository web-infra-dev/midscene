import { describe, expect, it, rs } from '@rstest/core';
import { WebDriverClient } from '../../src/clients/WebDriverClient';

// Expose protected method for testing
class TestableWebDriverClient extends WebDriverClient {
  public setSession(sessionId: string) {
    (this as any).sessionId = sessionId;
  }

  public testBuildSessionEndpoint(endpoint: string): string {
    return this.buildSessionEndpoint(endpoint);
  }

  public testMakeRequest(timeout: number): Promise<unknown> {
    return this.makeRequest('GET', '/status', undefined, { timeout });
  }
}

describe('WebDriverClient.buildSessionEndpoint', () => {
  const client = new TestableWebDriverClient({ port: 8100, host: 'localhost' });

  it('should prepend /session/{id} when endpoint does not start with /session/', () => {
    client.setSession('abc-123');
    expect(client.testBuildSessionEndpoint('/wda/apps/launch')).toBe(
      '/session/abc-123/wda/apps/launch',
    );
  });

  it('should not double-prepend when endpoint already starts with /session/', () => {
    client.setSession('abc-123');
    expect(
      client.testBuildSessionEndpoint('/session/abc-123/wda/apps/launch'),
    ).toBe('/session/abc-123/wda/apps/launch');
  });

  it('should handle endpoint without leading slash', () => {
    client.setSession('abc-123');
    expect(client.testBuildSessionEndpoint('wda/screen')).toBe(
      '/session/abc-123/wda/screen',
    );
  });

  it('should throw when no session exists', () => {
    const noSessionClient = new TestableWebDriverClient({
      port: 8100,
      host: 'localhost',
    });
    expect(() =>
      noSessionClient.testBuildSessionEndpoint('/wda/screen'),
    ).toThrow('No active WebDriver session');
  });
});

describe('WebDriverClient external session cleanup', () => {
  it('should detach external sessions without deleting them from the server', async () => {
    const client = new WebDriverClient({
      port: 8100,
      host: 'localhost',
      sessionId: 'external-session',
    });
    const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');

    expect(client.sessionInfo?.sessionId).toBe('external-session');

    await client.deleteSession();

    expect(makeRequestSpy).not.toHaveBeenCalled();
    expect(client.sessionInfo).toBeNull();
  });
});

describe('WebDriverClient per-request timeout', () => {
  it('overrides the client-wide timeout for one request', async () => {
    const originalFetch = globalThis.fetch;
    rs.useFakeTimers();
    globalThis.fetch = ((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          },
          { once: true },
        );
      })) as typeof fetch;

    try {
      const client = new TestableWebDriverClient({ timeout: 30_000 });
      const request = client.testMakeRequest(25);
      const assertion = expect(request).rejects.toThrow(
        'Request timeout after 25ms',
      );

      await rs.advanceTimersByTimeAsync(25);
      await assertion;
    } finally {
      globalThis.fetch = originalFetch;
      rs.useRealTimers();
    }
  });
});
