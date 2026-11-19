export type UrlMatch =
  | string
  | {
      origin?: string;
      pathname?: string;
      hash?: string;
      search?: Record<string, string>;
    };

export function replayError(code: string, details?: unknown) {
  return Object.assign(
    new Error(details ? `${code}: ${JSON.stringify(details)}` : code),
    {
      code,
      details,
    },
  );
}

export function normalizeUrlMatch(match: UrlMatch): UrlMatch {
  if (typeof match === 'string') {
    const url = new URL(match);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw replayError('INVALID_REPLAY_URL');
    return url.href;
  }
  if (
    !match ||
    typeof match !== 'object' ||
    Object.keys(match).some(
      (key) => !['origin', 'pathname', 'hash', 'search'].includes(key),
    ) ||
    !(
      match.origin ||
      match.pathname ||
      match.hash !== undefined ||
      Object.keys(match.search ?? {}).length
    ) ||
    (match.pathname !== undefined &&
      (typeof match.pathname !== 'string' ||
        !match.pathname.startsWith('/'))) ||
    (match.hash !== undefined &&
      match.hash !== '' &&
      (typeof match.hash !== 'string' || !match.hash.startsWith('#'))) ||
    (match.search !== undefined &&
      (!match.search ||
        Array.isArray(match.search) ||
        typeof match.search !== 'object' ||
        Object.values(match.search).some((value) => typeof value !== 'string')))
  )
    throw replayError('INVALID_REPLAY_URL_MATCH');
  if (
    match.origin !== undefined &&
    new URL(normalizeUrlMatch(match.origin) as string).origin !== match.origin
  )
    throw replayError('INVALID_REPLAY_ORIGIN');
  return match;
}

// Serialized into the browser. Keep this function self-contained.
/* istanbul ignore next -- browser realm has no host coverage counters */
export function matchesUrl(href: string, match: UrlMatch) {
  if (typeof match === 'string') return href === match;
  const url = new URL(href);
  return (
    (match.origin === undefined || url.origin === match.origin) &&
    (match.pathname === undefined || url.pathname === match.pathname) &&
    (match.hash === undefined || url.hash === match.hash) &&
    Object.entries(match.search ?? {}).every(([key, value]) => {
      const all = url.searchParams.getAll(key);
      return all.length === 1 && all[0] === value;
    })
  );
}

export function isNavigationRace(error: unknown) {
  return /Execution context was destroyed|Cannot find context with specified id|Cannot find context with id|Cannot find execution context|Inspected target navigated/i.test(
    String(error),
  );
}

export function deadlineAfter(ms: number) {
  if (!Number.isFinite(ms) || ms < 0)
    throw new TypeError('Expected a finite non-negative timeout');
  return performance.now() + ms;
}

export async function poll<T>(
  deadline: number,
  attempt: () => Promise<T | undefined>,
  onTimeout: () => never,
  retryError: (error: unknown) => boolean = isNavigationRace,
): Promise<T> {
  while (true) {
    try {
      const result = await attempt();
      if (result !== undefined) return result;
    } catch (error) {
      if (!retryError(error)) throw error;
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(50, remaining)),
      );
      continue;
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) onTimeout();
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(50, remaining)),
    );
  }
}

export function pageFunction<Args extends unknown[], T>(
  fn: (...args: Args) => T,
  args: Args,
) {
  if (typeof fn !== 'function' || fn.constructor.name === 'AsyncFunction')
    throw new TypeError('Expected a synchronous page function');
  return `(() => {
    const value = (${fn.toString()})(...${JSON.stringify(args)});
    if (typeof value?.then === 'function') throw new Error('Expected synchronous page function');
    return value;
  })()`;
}
