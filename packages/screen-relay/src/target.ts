import type { Size } from '@midscene/core';

export const MIDSCENE_SCREEN_RELAY_URL = 'MIDSCENE_SCREEN_RELAY_URL';
export const MIDSCENE_SCREEN_RELAY_TOKEN = 'MIDSCENE_SCREEN_RELAY_TOKEN';
export const DEFAULT_SCREEN_RELAY_URL = 'http://127.0.0.1:8080';

export interface ResolvedScreenRelayTarget {
  /** Clean origin URL with any path, query, or `#token=` stripped. */
  url: string;
  /** Session token resolved from explicit option, URL fragment/query, or env. */
  token?: string;
}

/**
 * Resolve a screen-relay target URL and token from options or environment.
 * Supports pasting the full Viewer URL printed by `screen-relay up`
 * (e.g. `http://127.0.0.1:8080/#token=<hex>`).
 */
export function parseScreenRelayTarget(opts?: {
  url?: string;
  token?: string;
}): ResolvedScreenRelayTarget {
  const rawUrl =
    opts?.url?.trim() ||
    process.env[MIDSCENE_SCREEN_RELAY_URL]?.trim() ||
    DEFAULT_SCREEN_RELAY_URL;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `Invalid screen-relay URL "${rawUrl}". Expected an http(s) URL such as http://127.0.0.1:8080.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported screen-relay URL protocol "${parsed.protocol}". Expected http: or https:.`,
    );
  }

  let tokenFromUrl: string | undefined;

  if (parsed.hash) {
    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const hashToken = hashParams.get('token')?.trim();
    if (hashToken) {
      tokenFromUrl = hashToken;
    }
  }

  const queryToken = parsed.searchParams.get('token')?.trim();
  if (queryToken) {
    tokenFromUrl ??= queryToken;
  }

  const token =
    opts?.token?.trim() ||
    tokenFromUrl ||
    process.env[MIDSCENE_SCREEN_RELAY_TOKEN]?.trim() ||
    undefined;

  return { url: parsed.origin, token };
}

/**
 * Strip `--token` and any `#token=` / `?token=` embedded in `--url` from CLI
 * arguments before `runToolsCLI` logs them, returning the extracted token
 * separately so callers can pass it via env without leaking it to logs.
 */
export function sanitizeScreenRelayCliArgs(argv: readonly string[]): {
  sanitizedArgv: string[];
  extractedToken?: string;
} {
  const sanitizedArgv: string[] = [];
  let extractedToken: string | undefined;

  const stripUrlToken = (raw: string): string => {
    try {
      const parsed = parseScreenRelayTarget({ url: raw });
      if (parsed.token && !extractedToken) {
        extractedToken = parsed.token;
      }
      return parsed.url;
    } catch {
      return raw;
    }
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--token' || arg === '--screen-relay-token') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        extractedToken = next.trim() || extractedToken;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--token=')) {
      extractedToken = arg.slice('--token='.length).trim() || extractedToken;
      continue;
    }
    if (arg.startsWith('--screen-relay-token=')) {
      extractedToken =
        arg.slice('--screen-relay-token='.length).trim() || extractedToken;
      continue;
    }
    if (arg === '--url' || arg === '--screen-relay-url') {
      sanitizedArgv.push(arg);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        sanitizedArgv.push(stripUrlToken(next));
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--url=')) {
      sanitizedArgv.push(`--url=${stripUrlToken(arg.slice('--url='.length))}`);
      continue;
    }
    if (arg.startsWith('--screen-relay-url=')) {
      sanitizedArgv.push(
        `--screen-relay-url=${stripUrlToken(arg.slice('--screen-relay-url='.length))}`,
      );
      continue;
    }
    sanitizedArgv.push(arg);
  }

  return { sanitizedArgv, extractedToken };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Read pixel dimensions directly from a PNG IHDR chunk (bytes 16..24).
 */
export function readPngDimensions(bytes: Uint8Array): Size | undefined {
  if (bytes.byteLength < 24) return undefined;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) return undefined;
  return { width, height };
}

/**
 * Only map aliases that `screen-relay`'s native MODIFIERS / NAMED_KEYS do not
 * already accept (it natively supports return, esc, up/down/left/right, ctrl,
 * control, shift, alt, super, meta, cmd, win, etc.).
 */
const KEY_ALIASES: Record<string, string> = {
  command: 'Meta',
  option: 'Alt',
  del: 'Delete',
  ' ': 'Space',
};

function mapKeyToken(token: string): string {
  return KEY_ALIASES[token.toLowerCase()] ?? token;
}

/**
 * Normalize a Midscene key name or shortcut (e.g. `Control+A`, `Command+C`,
 * `Control++`) into a combo accepted by `screen-relay`'s `client.key()`.
 *
 * Preserves literal `+` keys and lowercases single uppercase letters when
 * combined with modifiers so `screen-relay` does not implicitly add `Shift`.
 */
export function normalizeScreenRelayKey(keySpec: string): string {
  const trimmed = keySpec === ' ' ? ' ' : keySpec.trim();
  if (!trimmed) {
    throw new Error('Key name cannot be empty.');
  }

  const split =
    trimmed === '+' || trimmed.endsWith('++')
      ? trimmed.length - 2
      : trimmed.lastIndexOf('+');

  if (split < 0) {
    return mapKeyToken(trimmed);
  }

  const modifiers = trimmed
    .slice(0, split)
    .split('+')
    .map((part) => mapKeyToken(part.trim()))
    .filter(Boolean);

  let mainKey =
    trimmed === '+' || trimmed.endsWith('++')
      ? '+'
      : mapKeyToken(trimmed.slice(split + 1).trim());

  if (modifiers.length > 0 && /^[A-Z]$/.test(mainKey)) {
    mainKey = mainKey.toLowerCase();
  }

  return modifiers.length > 0 ? [...modifiers, mainKey].join('+') : mainKey;
}
