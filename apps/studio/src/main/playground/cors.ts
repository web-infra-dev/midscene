const STUDIO_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

export function isAllowedStudioOrigin(origin?: string): boolean {
  if (!origin || origin === 'null') {
    return true;
  }

  try {
    const url = new URL(origin);
    if (url.protocol === 'file:') {
      return true;
    }

    return STUDIO_LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function createStudioCorsOptions() {
  return {
    origin(origin: string | undefined, callback: CorsOriginCallback) {
      callback(null, isAllowedStudioOrigin(origin));
    },
    credentials: true,
  };
}
