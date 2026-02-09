import { describe, expect, it } from 'vitest';
import { WebDriverClient } from '../../src/clients/WebDriverClient';

// Expose protected method for testing
class TestableWebDriverClient extends WebDriverClient {
  public setSession(sessionId: string) {
    (this as any).sessionId = sessionId;
  }

  public testBuildSessionEndpoint(endpoint: string): string {
    return this.buildSessionEndpoint(endpoint);
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
    expect(() => noSessionClient.testBuildSessionEndpoint('/wda/screen')).toThrow(
      'No active WebDriver session',
    );
  });
});
