import { describe, expect, it } from 'vitest';
import {
  STUDIO_WEB_CDP_ENDPOINT_ENV,
  createStudioWebCdpConnectOptions,
  resolveStudioWebCdpEndpoint,
} from '../src/main/playground/web-cdp';

describe('Studio Web CDP configuration', () => {
  it('prefers the Studio-specific endpoint and falls back to the shared endpoint', () => {
    expect(
      resolveStudioWebCdpEndpoint({
        [STUDIO_WEB_CDP_ENDPOINT_ENV]: ' http://127.0.0.1:9222 ',
        MIDSCENE_CDP_ENDPOINT: 'ws://127.0.0.1:9333/devtools/browser/shared',
      }),
    ).toBe('http://127.0.0.1:9222');
    expect(
      resolveStudioWebCdpEndpoint({
        MIDSCENE_CDP_ENDPOINT: ' ws://127.0.0.1:9333/devtools/browser/shared ',
      }),
    ).toBe('ws://127.0.0.1:9333/devtools/browser/shared');
    expect(resolveStudioWebCdpEndpoint({})).toBeUndefined();
  });

  it('builds Puppeteer connect options for HTTP and WebSocket endpoints', () => {
    expect(createStudioWebCdpConnectOptions('http://127.0.0.1:9222')).toEqual({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null,
    });
    expect(
      createStudioWebCdpConnectOptions(
        'ws://127.0.0.1:9222/devtools/browser/example',
      ),
    ).toEqual({
      browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/example',
      defaultViewport: null,
    });
  });

  it('rejects unsupported endpoint formats', () => {
    expect(() => createStudioWebCdpConnectOptions('127.0.0.1:9222')).toThrow(
      `${STUDIO_WEB_CDP_ENDPOINT_ENV} must be an http(s) or ws(s) CDP endpoint`,
    );
  });
});
