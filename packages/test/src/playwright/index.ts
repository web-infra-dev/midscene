import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_UNTIL = 'domcontentloaded' as const;
const SUPPORTED_WEB_PROTOCOLS = new Set(['http:', 'https:']);

type PlaywrightCookie = Parameters<BrowserContext['addCookies']>[0][number];
type CookieClearOptions = NonNullable<
  Parameters<BrowserContext['clearCookies']>[0]
>;

type NodeContext<TContext> = NodeExecutionContext<unknown, TContext>;

/** Context passed to a configured Playwright cookie profile resolver. */
export interface PlaywrightCookieProfileContext<TContext> {
  /** Profile reference from the setCookies Node input. */
  profile: string;
  /** Project Context for the current workflow. */
  context: TContext;
  /** Cancellation signal for the current Node execution. */
  signal: AbortSignal;
}

/** Dependencies and source resolvers used by the Playwright preset Nodes. */
export interface CreatePlaywrightNodesOptions<TContext> {
  /** Return the Playwright Page associated with the current workflow. */
  getPage(ctx: NodeContext<TContext>): Awaitable<Page>;
  /** Return the base URL used to resolve relative gotoUrl inputs. */
  getBaseUrl?(ctx: NodeContext<TContext>): Awaitable<string | undefined>;
  /**
   * Return the environment used by setCookies. Defaults to process.env when
   * omitted.
   */
  getEnv?(
    ctx: NodeContext<TContext>,
  ): Awaitable<Readonly<Record<string, string | undefined>>>;
  /** Resolve a named cookie profile without placing cookie values in YAML. */
  getCookieProfile?(
    input: PlaywrightCookieProfileContext<TContext>,
  ): Awaitable<readonly PlaywrightCookie[]>;
  /**
   * Resolve a storage-state reference to a file path. References are resolved
   * from process.cwd() when omitted.
   */
  resolveStorageStatePath?(
    path: string,
    ctx: NodeContext<TContext>,
  ): Awaitable<string>;
}

/** Input schema for the Playwright gotoUrl Node. */
export const gotoUrlInputSchema = z
  .strictObject({
    prompt: z
      .string()
      .min(1)
      .optional()
      .describe('String shorthand for the URL to open.'),
    url: z
      .string()
      .min(1)
      .optional()
      .describe('An absolute HTTP(S) URL or a path relative to baseUrl.'),
    waitUntil: z
      .enum(['commit', 'domcontentloaded', 'load', 'networkidle'])
      .default(DEFAULT_WAIT_UNTIL)
      .describe('The Playwright navigation lifecycle event to wait for.'),
    timeoutMs: z
      .number()
      .positive()
      .default(DEFAULT_NAVIGATION_TIMEOUT_MS)
      .describe('The navigation timeout in milliseconds.'),
  })
  .superRefine((input, ctx) => {
    if ((input.prompt === undefined) === (input.url === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'exactly one of prompt and url is required',
      });
    }
  });

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

/** Input schema for the Playwright clearCookies Node. */
export const clearCookiesInputSchema = z.strictObject({
  name: z.string().regex(/\S/).optional().describe('Cookie name to clear.'),
  domain: z.string().regex(/\S/).optional().describe('Cookie domain to clear.'),
  path: z.string().regex(/\S/).optional().describe('Cookie path to clear.'),
});

/** Input schema for the Playwright setViewportSize Node. */
export const setViewportSizeInputSchema = z.strictObject({
  width: z.number().int().positive().describe('Viewport width in CSS pixels.'),
  height: z
    .number()
    .int()
    .positive()
    .describe('Viewport height in CSS pixels.'),
});

/** Validated input accepted by the Playwright gotoUrl Node. */
export type GotoUrlNodeInput = z.infer<typeof gotoUrlInputSchema>;
/** Validated input accepted by the Playwright setCookies Node. */
export type SetCookiesNodeInput = z.infer<typeof setCookiesInputSchema>;
/** Validated input accepted by the Playwright clearCookies Node. */
export type ClearCookiesNodeInput = z.infer<typeof clearCookiesInputSchema>;
/** Validated input accepted by the Playwright setViewportSize Node. */
export type SetViewportSizeNodeInput = z.infer<
  typeof setViewportSizeInputSchema
>;

/** Structured navigation details returned by the Playwright gotoUrl Node. */
export interface GotoUrlNodeResult {
  /** Final Page URL after navigation and redirects. */
  url: string;
  /** Main-resource HTTP status, or null when Playwright returns no response. */
  status: number | null;
  /** Document title after navigation completes. */
  title: string;
}

/** Secret-free metadata returned by the Playwright setCookies Node. */
export interface SetCookiesNodeResult {
  /** Kind of configured reference used to resolve the cookies. */
  source: 'env' | 'profile' | 'storage-state';
  /** Environment variable, profile, or storage-state reference name. */
  sourceName: string;
  /** Number of cookies passed to the BrowserContext. */
  count: number;
}

const throwIfAborted = (signal: AbortSignal, operation: string) => {
  if (signal.aborted) {
    throw signal.reason ?? new Error(`${operation} aborted.`);
  }
};

const requireOptions = <TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
) => {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createPlaywrightNodes() options must be an object.',
    );
  }
  if (typeof options.getPage !== 'function') {
    throw new NodeDefinitionError(
      'createPlaywrightNodes() requires getPage().',
    );
  }
};

const resolveWebUrl = (
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
        ? `${label} must be an absolute URL when getBaseUrl() is not configured.`
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
    if (!name)
      throw new TypeError('setCookies Cookie header contains an empty name.');
    return { name, value, url } satisfies PlaywrightCookie;
  });
};

const parseCookieJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new TypeError(
      'setCookies source must contain valid JSON or a Cookie header.',
      { cause: error },
    );
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

/**
 * Create the P0 Playwright preset Nodes without assuming Project Context field
 * names. Cookie values must be resolved through configured references and are
 * never accepted as inline Node input.
 */
export function createPlaywrightNodes<TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  requireOptions(options);

  const gotoUrlNode = defineNode<
    typeof gotoUrlInputSchema,
    GotoUrlNodeResult,
    TContext
  >({
    name: 'gotoUrl',
    title: 'Open a Web URL',
    description:
      'Navigate the current Playwright Page to an absolute HTTP(S) URL or a path relative to the configured baseUrl.',
    inputSchema: gotoUrlInputSchema,
    async execute(ctx) {
      throwIfAborted(ctx.signal, 'gotoUrl');
      const page = await options.getPage(ctx);
      const baseUrl = await options.getBaseUrl?.(ctx);
      const target = ctx.input.url ?? ctx.input.prompt!;
      const url = resolveWebUrl(target, baseUrl, 'gotoUrl.url');
      const response = await page.goto(url, {
        waitUntil: ctx.input.waitUntil,
        timeout: ctx.input.timeoutMs,
      });
      const status = response?.status() ?? null;
      if (status !== null && status >= 400) {
        throw new Error(`Navigation failed with HTTP ${status}: ${page.url()}`);
      }
      const result = {
        url: page.url(),
        status,
        title: await page.title(),
      };
      return { summary: `Navigated to ${result.url}`, data: result };
    },
  });

  const setCookiesNode = defineNode<
    typeof setCookiesInputSchema,
    SetCookiesNodeResult,
    TContext
  >({
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

      let rawCookies: unknown;
      let source: SetCookiesNodeResult['source'];
      let sourceName: string;
      if (ctx.input.cookiesEnv !== undefined) {
        source = 'env';
        sourceName = ctx.input.cookiesEnv;
        let env: Readonly<Record<string, string | undefined>>;
        try {
          env = (await options.getEnv?.(ctx)) ?? process.env;
        } catch {
          throw new Error(
            `Failed to resolve cookie environment ${ctx.input.cookiesEnv}; the original error was redacted because it may contain cookie values.`,
          );
        }
        const raw = env[ctx.input.cookiesEnv];
        if (!raw?.trim()) {
          throw new Error(
            `Environment variable ${ctx.input.cookiesEnv} is missing or blank.`,
          );
        }
        const trimmed = raw.trim();
        rawCookies = /^[\[{]/.test(trimmed)
          ? parseCookieJson(trimmed)
          : parseCookieHeader(trimmed, defaultUrl);
      } else if (ctx.input.profile !== undefined) {
        source = 'profile';
        sourceName = ctx.input.profile;
        if (!options.getCookieProfile) {
          throw new Error(
            'setCookies.profile requires createPlaywrightNodes({ getCookieProfile }).',
          );
        }
        try {
          rawCookies = await options.getCookieProfile({
            profile: ctx.input.profile,
            context: ctx.context,
            signal: ctx.signal,
          });
        } catch {
          throw new Error(
            `Failed to resolve cookie profile ${ctx.input.profile}; the original error was redacted because it may contain cookie values.`,
          );
        }
      } else {
        source = 'storage-state';
        sourceName = ctx.input.storageStatePath!;
        const path = options.resolveStorageStatePath
          ? await options.resolveStorageStatePath(sourceName, ctx)
          : resolve(process.cwd(), sourceName);
        const raw = await readFile(path, 'utf8');
        rawCookies = parseCookieJson(raw);
      }

      const cookies = normalizeCookies(rawCookies, defaultUrl);
      throwIfAborted(ctx.signal, 'setCookies');
      try {
        await page.context().addCookies(cookies);
      } catch {
        throw new Error(
          `Failed to set ${cookies.length} browser cookie(s); the browser error was redacted because it may contain cookie values.`,
        );
      }

      const result: SetCookiesNodeResult = {
        source,
        sourceName,
        count: cookies.length,
      };
      return {
        summary: `Set ${result.count} browser cookie(s) from ${source} source ${sourceName}`,
        data: result,
      };
    },
  });

  const clearCookiesNode = defineNode<
    typeof clearCookiesInputSchema,
    { filters: CookieClearOptions },
    TContext
  >({
    name: 'clearCookies',
    title: 'Clear browser cookies',
    description:
      'Clear all cookies from the current Playwright BrowserContext, or only cookies matching name, domain, or path.',
    inputSchema: clearCookiesInputSchema,
    async execute(ctx) {
      throwIfAborted(ctx.signal, 'clearCookies');
      const page = await options.getPage(ctx);
      const filters: CookieClearOptions = {
        ...(ctx.input.name === undefined ? {} : { name: ctx.input.name }),
        ...(ctx.input.domain === undefined ? {} : { domain: ctx.input.domain }),
        ...(ctx.input.path === undefined ? {} : { path: ctx.input.path }),
      };
      await page.context().clearCookies(filters);
      const filterNames = Object.keys(filters);
      return {
        summary:
          filterNames.length === 0
            ? 'Cleared all browser cookies'
            : `Cleared browser cookies matching ${filterNames.join(', ')}`,
        data: { filters },
      };
    },
  });

  const setViewportSizeNode = defineNode<
    typeof setViewportSizeInputSchema,
    { width: number; height: number },
    TContext
  >({
    name: 'setViewportSize',
    title: 'Set the browser viewport size',
    description:
      'Set the current Playwright Page viewport size in CSS pixels and return the effective size.',
    inputSchema: setViewportSizeInputSchema,
    async execute(ctx) {
      throwIfAborted(ctx.signal, 'setViewportSize');
      const page = await options.getPage(ctx);
      await page.setViewportSize({
        width: ctx.input.width,
        height: ctx.input.height,
      });
      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error(
          'Playwright did not report an effective viewport size.',
        );
      }
      return {
        summary: `Set viewport to ${viewport.width}x${viewport.height}`,
        data: viewport,
      };
    },
  });

  return [gotoUrlNode, setCookiesNode, clearCookiesNode, setViewportSizeNode];
}
