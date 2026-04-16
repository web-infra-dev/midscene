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

export function createProxyDispatcher({
  env = process.env,
  ProxyAgentClass,
} = {}) {
  const proxyUrl = getProxyUrl(env);
  if (!proxyUrl) {
    return undefined;
  }

  const ProxyAgentImpl = ProxyAgentClass;
  if (!ProxyAgentImpl) {
    throw new Error('ProxyAgent implementation is required');
  }

  return new ProxyAgentImpl({
    uri: proxyUrl,
  });
}
