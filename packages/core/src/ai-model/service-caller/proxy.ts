import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser } from '@midscene/shared/utils';

// Helper function to sanitize proxy URL for logging (remove credentials)
// Uses URL API instead of regex to avoid ReDoS vulnerabilities
const sanitizeProxyUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.username) {
      // Keep username for debugging, hide password for security
      parsed.password = '****';
      return parsed.href;
    }
    return url;
  } catch {
    // If URL parsing fails, return original URL (will be caught later)
    return url;
  }
};

export const createProxyAgent = async ({
  socksProxy,
  httpProxy,
}: {
  socksProxy: string | undefined;
  httpProxy: string | undefined;
}): Promise<unknown> => {
  const warnProxy = getDebug('ai:call:proxy', { console: true });
  const debugProxy = getDebug('ai:call:proxy');

  if (httpProxy) {
    debugProxy('using http proxy', sanitizeProxyUrl(httpProxy));
    if (ifInBrowser) {
      warnProxy(
        'HTTP proxy is configured but not supported in browser environment',
      );
    } else {
      const { loadUndici } = await import('#proxy-deps');
      const { ProxyAgent } = await loadUndici();
      const proxyAgent = new ProxyAgent({
        uri: httpProxy,
        // Note: authentication is handled via the URI (e.g., http://user:pass@proxy.com:8080)
      });
      return proxyAgent;
    }
  } else if (socksProxy) {
    debugProxy('using socks proxy', sanitizeProxyUrl(socksProxy));
    if (ifInBrowser) {
      warnProxy(
        'SOCKS proxy is configured but not supported in browser environment',
      );
    } else {
      try {
        const { loadFetchSocks } = await import('#proxy-deps');
        const { socksDispatcher } = await loadFetchSocks();
        // Parse SOCKS proxy URL (e.g., socks5://127.0.0.1:1080)
        const proxyUrl = new URL(socksProxy);

        // Validate hostname
        if (!proxyUrl.hostname) {
          throw new Error('SOCKS proxy URL must include a valid hostname');
        }

        // Validate and parse port
        const port = Number.parseInt(proxyUrl.port, 10);
        if (!proxyUrl.port || Number.isNaN(port)) {
          throw new Error('SOCKS proxy URL must include a valid port');
        }

        // Parse SOCKS version from protocol
        const protocol = proxyUrl.protocol.replace(':', '');
        const socksType =
          protocol === 'socks4' ? 4 : protocol === 'socks5' ? 5 : 5;

        const proxyAgent = socksDispatcher({
          type: socksType,
          host: proxyUrl.hostname,
          port,
          ...(proxyUrl.username
            ? {
                userId: decodeURIComponent(proxyUrl.username),
                password: decodeURIComponent(proxyUrl.password || ''),
              }
            : {}),
        });
        debugProxy('socks proxy configured successfully', {
          type: socksType,
          host: proxyUrl.hostname,
          port: port,
        });
        return proxyAgent;
      } catch (error) {
        warnProxy('Failed to configure SOCKS proxy:', error);
        throw new Error(
          `Invalid SOCKS proxy URL: ${socksProxy}. Expected format: socks4://host:port, socks5://host:port, or with authentication: socks5://user:pass@host:port`,
        );
      }
    }
  }
};
