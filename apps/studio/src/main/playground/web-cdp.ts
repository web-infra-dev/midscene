import type { Browser, ConnectOptions } from 'puppeteer';

export const STUDIO_WEB_CDP_ENDPOINT_ENV = 'MIDSCENE_STUDIO_WEB_CDP_ENDPOINT';

type PuppeteerConnectApi = {
  connect: (options: ConnectOptions) => Promise<Browser>;
};

export function resolveStudioWebCdpEndpoint(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const studioEndpoint = env[STUDIO_WEB_CDP_ENDPOINT_ENV]?.trim();
  if (studioEndpoint) {
    return studioEndpoint;
  }

  return env.MIDSCENE_CDP_ENDPOINT?.trim() || undefined;
}

export function createStudioWebCdpConnectOptions(
  endpoint: string,
): ConnectOptions {
  const normalizedEndpoint = endpoint.trim();
  if (/^wss?:\/\//i.test(normalizedEndpoint)) {
    return {
      browserWSEndpoint: normalizedEndpoint,
      defaultViewport: null,
    };
  }
  if (/^https?:\/\//i.test(normalizedEndpoint)) {
    return {
      browserURL: normalizedEndpoint,
      defaultViewport: null,
    };
  }

  throw new Error(
    `${STUDIO_WEB_CDP_ENDPOINT_ENV} must be an http(s) or ws(s) CDP endpoint, but received "${endpoint}".`,
  );
}

export function connectStudioWebBrowser(
  puppeteer: PuppeteerConnectApi,
  endpoint: string,
): Promise<Browser> {
  return puppeteer.connect(createStudioWebCdpConnectOptions(endpoint));
}
