import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod/v4';
import { defineNode } from '../node/define-node';
import type { NodeDefinition } from '../node/types';
import type {
  CreatePlaywrightNodesOptions,
  PlaywrightCookie,
  PlaywrightNodeContext,
} from './types';
import { resolveWebUrl, throwIfAborted } from './utils';

type CookieSourceReference =
  | { kind: 'env'; name: string }
  | { kind: 'profile'; name: string }
  | { kind: 'storage-state'; name: string };

interface ResolvedCookieSource {
  reference: CookieSourceReference;
  cookies: unknown;
}

/** Input schema for the Playwright setCookies Node. */
export const setCookiesInputSchema = z
  .strictObject({
    cookiesEnv: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .optional()
      .describe(
        'The environment variable containing a Cookie header, cookie array JSON, or Playwright storage-state JSON.',
      ),
    profile: z
      .string()
      .regex(/\S/)
      .optional()
      .describe('A cookie profile resolved by getCookieProfile().'),
    storageStatePath: z
      .string()
      .regex(/\S/)
      .optional()
      .describe('A path to a Playwright storage-state JSON file.'),
    url: z
      .string()
      .url()
      .optional()
      .describe(
        'The HTTP(S) URL used to scope Cookie-header values or cookies without domain/path.',
      ),
  })
  .superRefine((input, ctx) => {
    const sourceCount = [
      input.cookiesEnv,
      input.profile,
      input.storageStatePath,
    ].filter((value) => value !== undefined).length;
    if (sourceCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        message:
          'exactly one of cookiesEnv, profile, and storageStatePath is required',
      });
    }
  });

/** Validated input accepted by the Playwright setCookies Node. */
export type SetCookiesNodeInput = z.infer<typeof setCookiesInputSchema>;

/** Secret-free metadata returned by the Playwright setCookies Node. */
export interface SetCookiesNodeResult {
  /** Kind of configured reference used to resolve the cookies. */
  source: CookieSourceReference['kind'];
  /** Environment variable, profile, or storage-state reference name. */
  sourceName: string;
  /** Number of cookies passed to the BrowserContext. */
  count: number;
}

const toCookieSourceReference = (
  input: SetCookiesNodeInput,
): CookieSourceReference => {
  if (input.cookiesEnv !== undefined) {
    return { kind: 'env', name: input.cookiesEnv };
  }
  if (input.profile !== undefined) {
    return { kind: 'profile', name: input.profile };
  }
  if (input.storageStatePath !== undefined) {
    return { kind: 'storage-state', name: input.storageStatePath };
  }
  throw new TypeError('setCookies requires one cookie source.');
};

const parseCookieHeader = (raw: string, url: string | undefined) => {
  if (url === undefined) {
    throw new TypeError(
      'setCookies.url is required when cookiesEnv contains a Cookie header.',
    );
  }
  const segments = raw
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    throw new TypeError('setCookies Cookie header contains no cookies.');
  }
  return segments.map((segment) => {
    const separator = segment.indexOf('=');
    if (separator <= 0) {
      throw new TypeError(
        'setCookies Cookie header contains an invalid name/value pair.',
      );
    }
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (!name) {
      throw new TypeError('setCookies Cookie header contains an empty name.');
    }
    return { name, value, url } satisfies PlaywrightCookie;
  });
};

const parseCookieJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new TypeError(
      'setCookies source must contain valid JSON or a Cookie header.',
    );
  }
};

const resolveCookieSource = async <TContext>(
  reference: CookieSourceReference,
  defaultUrl: string | undefined,
  ctx: PlaywrightNodeContext<TContext>,
  options: CreatePlaywrightNodesOptions<TContext>,
): Promise<ResolvedCookieSource> => {
  switch (reference.kind) {
    case 'env': {
      let env: Readonly<Record<string, string | undefined>>;
      try {
        env = (await options.getEnv?.(ctx)) ?? process.env;
      } catch {
        throw new Error(
          `Failed to resolve cookie environment ${reference.name}; the original error was redacted because it may contain cookie values.`,
        );
      }
      const raw = env[reference.name];
      if (!raw?.trim()) {
        throw new Error(
          `Environment variable ${reference.name} is missing or blank.`,
        );
      }
      const trimmed = raw.trim();
      return {
        reference,
        cookies: /^[\[{]/.test(trimmed)
          ? parseCookieJson(trimmed)
          : parseCookieHeader(trimmed, defaultUrl),
      };
    }
    case 'profile': {
      if (!options.getCookieProfile) {
        throw new Error(
          'setCookies.profile requires createPlaywrightNodes({ getCookieProfile }).',
        );
      }
      try {
        return {
          reference,
          cookies: await options.getCookieProfile({
            profile: reference.name,
            context: ctx.context,
            signal: ctx.signal,
          }),
        };
      } catch {
        throw new Error(
          `Failed to resolve cookie profile ${reference.name}; the original error was redacted because it may contain cookie values.`,
        );
      }
    }
    case 'storage-state': {
      const path = options.resolveStorageStatePath
        ? await options.resolveStorageStatePath(reference.name, ctx)
        : resolve(process.cwd(), reference.name);
      return {
        reference,
        cookies: parseCookieJson(await readFile(path, 'utf8')),
      };
    }
  }
};

const normalizeCookie = (
  candidate: unknown,
  defaultUrl: string | undefined,
  index: number,
): PlaywrightCookie => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(
      `setCookies cookie at index ${index} must be an object.`,
    );
  }
  const cookie = candidate as Record<string, unknown>;
  if (typeof cookie.name !== 'string' || !cookie.name.trim()) {
    throw new TypeError(
      `setCookies cookie at index ${index} requires a non-blank name.`,
    );
  }
  if (typeof cookie.value !== 'string') {
    throw new TypeError(
      `setCookies cookie at index ${index} requires a string value.`,
    );
  }

  const normalized = { ...cookie } as unknown as PlaywrightCookie;
  const hasUrl = typeof cookie.url === 'string' && cookie.url.length > 0;
  const hasDomain =
    typeof cookie.domain === 'string' && cookie.domain.length > 0;
  if (!hasUrl && !hasDomain) {
    if (defaultUrl === undefined) {
      throw new TypeError(
        `setCookies cookie at index ${index} requires url or domain, or setCookies.url must be provided.`,
      );
    }
    normalized.url = defaultUrl;
  }
  if (hasDomain && typeof cookie.path !== 'string') {
    normalized.path = '/';
  }
  return normalized;
};

const normalizeCookies = (
  source: unknown,
  defaultUrl: string | undefined,
): PlaywrightCookie[] => {
  const candidates = Array.isArray(source)
    ? source
    : source &&
        typeof source === 'object' &&
        Array.isArray((source as { cookies?: unknown }).cookies)
      ? (source as { cookies: unknown[] }).cookies
      : undefined;
  if (!candidates) {
    throw new TypeError(
      'setCookies JSON must be a cookie array or an object with a cookies array.',
    );
  }
  if (candidates.length === 0) {
    throw new TypeError('setCookies source contains no cookies.');
  }
  return candidates.map((cookie, index) =>
    normalizeCookie(cookie, defaultUrl, index),
  );
};

export const createSetCookiesNode = <TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
): NodeDefinition<any, any, TContext> =>
  defineNode<typeof setCookiesInputSchema, SetCookiesNodeResult, TContext>({
    name: 'setCookies',
    title: 'Set browser cookies',
    description:
      'Load cookies from an environment variable, configured profile, or Playwright storage-state file without persisting cookie values in workflow input or output.',
    inputSchema: setCookiesInputSchema,
    async execute(ctx) {
      throwIfAborted(ctx.signal, 'setCookies');
      const page = await options.getPage(ctx);
      const defaultUrl =
        ctx.input.url === undefined
          ? undefined
          : resolveWebUrl(ctx.input.url, undefined, 'setCookies.url');
      const reference = toCookieSourceReference(ctx.input);
      const resolved = await resolveCookieSource(
        reference,
        defaultUrl,
        ctx,
        options,
      );
      const cookies = normalizeCookies(resolved.cookies, defaultUrl);

      throwIfAborted(ctx.signal, 'setCookies');
      try {
        await page.context().addCookies(cookies);
      } catch {
        throw new Error(
          `Failed to set ${cookies.length} browser cookie(s); the browser error was redacted because it may contain cookie values.`,
        );
      }

      const result: SetCookiesNodeResult = {
        source: resolved.reference.kind,
        sourceName: resolved.reference.name,
        count: cookies.length,
      };
      return {
        summary: `Set ${result.count} browser cookie(s) from ${result.source} source ${result.sourceName}`,
        data: result,
      };
    },
  });
