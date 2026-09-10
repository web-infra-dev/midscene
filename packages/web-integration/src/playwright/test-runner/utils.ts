import type { PlaywrightTestRunnerAgent } from './types';

const SUPPORTED_WEB_PROTOCOLS = new Set(['http:', 'https:']);

export const throwIfAborted = (signal: AbortSignal, operation: string) => {
  if (signal.aborted) {
    throw signal.reason ?? new Error(`${operation} aborted.`);
  }
};

export const resolveWebUrl = (
  target: string,
  baseUrl: string | undefined,
  label: string,
): string => {
  const trimmed = target.trim();
  if (!trimmed) throw new TypeError(`${label} must not be blank.`);

  let resolved: URL;
  try {
    resolved =
      baseUrl === undefined ? new URL(trimmed) : new URL(trimmed, baseUrl);
  } catch (error) {
    throw new TypeError(
      baseUrl === undefined
        ? `${label} must be an absolute HTTP(S) URL.`
        : `${label} is not a valid URL.`,
      { cause: error },
    );
  }
  if (!SUPPORTED_WEB_PROTOCOLS.has(resolved.protocol)) {
    throw new TypeError(
      `${label} does not support the ${resolved.protocol} protocol.`,
    );
  }
  return resolved.toString();
};

export const requirePlaywrightAgent = (
  agent: unknown,
): PlaywrightTestRunnerAgent => {
  if (
    !agent ||
    typeof agent !== 'object' ||
    !('interface' in agent) ||
    !agent.interface ||
    typeof agent.interface !== 'object' ||
    !('underlyingPage' in agent.interface) ||
    !agent.interface.underlyingPage
  ) {
    throw new TypeError(
      'getAgent() must return a Playwright Agent with an underlying Page.',
    );
  }
  return agent as PlaywrightTestRunnerAgent;
};
