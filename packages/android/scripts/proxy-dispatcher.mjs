import { ProxyAgent } from 'undici';

export function getProxyUrl(env = process.env) {
  return env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy;
}

export function sanitizeProxyUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.username) {
      parsed.password = '****';
      return parsed.href;
    }
    return parsed.href;
  } catch {
    return url;
  }
}

export function createProxyDispatcher({ proxyUrl } = {}) {
  if (!proxyUrl) {
    return undefined;
  }

  return new ProxyAgent({
    uri: proxyUrl,
  });
}

export function createLoggedProxyDispatcher({
  env = process.env,
  log = console.log,
  logPrefix,
} = {}) {
  const proxyUrl = getProxyUrl(env);

  if (proxyUrl) {
    log(`[${logPrefix}] Using proxy: ${sanitizeProxyUrl(proxyUrl)}`);
  }

  return createProxyDispatcher({ proxyUrl });
}
