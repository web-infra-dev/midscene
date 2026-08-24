import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import type { CollectedCase } from '../src/parser/types';
import {
  clearCookiesInputSchema,
  createPlaywrightNodes,
  gotoUrlInputSchema,
  setCookiesInputSchema,
  setViewportSizeInputSchema,
} from '../src/playwright';

const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'playwright-nodes',
  projectId: 'project',
  sourcePath: 'flows/playwright.yaml',
  caseIndex: 0,
  definition: { name: 'playwright nodes', steps },
});

const step = (node: string, input: Record<string, unknown>) => ({
  node,
  input,
  meta: { continueOnError: false },
});

const createPage = () => {
  const browserContext = {
    addCookies: vi.fn(async () => undefined),
    clearCookies: vi.fn(async () => undefined),
  };
  let viewport = { width: 800, height: 600 };
  const page = {
    context: () => browserContext,
    goto: vi.fn(
      async (): Promise<{ status(): number }> => ({
        status: () => 200,
      }),
    ),
    url: vi.fn(() => 'https://example.com/final'),
    title: vi.fn(async () => 'Example'),
    setViewportSize: vi.fn(async (size: typeof viewport) => {
      viewport = size;
    }),
    viewportSize: vi.fn(() => viewport),
  };
  return {
    browserContext,
    page: page as unknown as Page,
    pageMock: page,
  };
};

describe('createPlaywrightNodes', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  it('registers the P0 Playwright nodes and validates factory options', () => {
    const { page } = createPage();
    const nodes = createPlaywrightNodes({ getPage: () => page });
    expect(nodes.map((node) => node.name)).toEqual([
      'gotoUrl',
      'setCookies',
      'clearCookies',
      'setViewportSize',
    ]);
    expect(() => createPlaywrightNodes({} as never)).toThrow(
      'createPlaywrightNodes() requires getPage()',
    );
    expect(gotoUrlInputSchema.parse({ url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
      waitUntil: 'domcontentloaded',
      timeoutMs: 60_000,
    });
    expect(setCookiesInputSchema.safeParse({ profile: 'member' }).success).toBe(
      true,
    );
    expect(clearCookiesInputSchema.parse({})).toEqual({});
    expect(
      setViewportSizeInputSchema.safeParse({ width: 800, height: 600 }).success,
    ).toBe(true);
  });

  it('navigates relative URLs and reports HTTP failures', async () => {
    const { page, pageMock } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getBaseUrl: () => 'https://example.com/root/',
      }),
    );

    const success = await runCollectedCase(
      collected([step('gotoUrl', { prompt: '/orders' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(success.steps[0].output?.data).toEqual({
      url: 'https://example.com/final',
      status: 200,
      title: 'Example',
    });
    expect(pageMock.goto).toHaveBeenCalledWith('https://example.com/orders', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    pageMock.goto.mockResolvedValueOnce({ status: () => 503 });
    const failure = await runCollectedCase(
      collected([step('gotoUrl', { url: 'https://example.com/down' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(failure.steps[0].error?.message).toContain('HTTP 503');
  });

  it('loads cookie secrets by reference without persisting their values', async () => {
    const { browserContext, page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getEnv: () => ({
          E2E_COOKIES: JSON.stringify([
            { name: 'session', value: 'top-secret-value' },
          ]),
        }),
      }),
    );

    const result = await runCollectedCase(
      collected([
        step('setCookies', {
          cookiesEnv: 'E2E_COOKIES',
          url: 'https://example.com',
        }),
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(browserContext.addCookies).toHaveBeenCalledWith([
      {
        name: 'session',
        value: 'top-secret-value',
        url: 'https://example.com/',
      },
    ]);
    expect(result.steps[0].output?.data).toEqual({
      source: 'env',
      sourceName: 'E2E_COOKIES',
      count: 1,
    });
    expect(JSON.stringify(result)).not.toContain('top-secret-value');
  });

  it('does not persist cookie names or URL scopes from secret sources', async () => {
    const { browserContext, page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getCookieProfile: () => [
          {
            name: 'sensitive-cookie-name',
            value: 'sensitive-cookie-value',
            url: 'https://user:password@example.com/path?token=query-secret',
          },
        ],
      }),
    );

    const result = await runCollectedCase(
      collected([step('setCookies', { profile: 'member' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].output?.data).toEqual({
      source: 'profile',
      sourceName: 'member',
      count: 1,
    });
    expect(browserContext.addCookies).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('sensitive-cookie-name');
    expect(serialized).not.toContain('sensitive-cookie-value');
    expect(serialized).not.toContain('query-secret');
    expect(serialized).not.toContain('user:password');
  });

  it('redacts cookie environment resolver failures', async () => {
    const { page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getEnv: () => {
          throw new Error('environment contains top-secret-value');
        },
      }),
    );

    const result = await runCollectedCase(
      collected([step('setCookies', { cookiesEnv: 'E2E_COOKIES' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].error?.message).toContain(
      'Failed to resolve cookie environment E2E_COOKIES',
    );
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
    expect(JSON.stringify(result)).not.toContain('top-secret-value');
  });

  it('redacts cookie values from browser injection failures', async () => {
    const { browserContext, page } = createPage();
    browserContext.addCookies.mockRejectedValueOnce(
      new Error('invalid cookie value: top-secret-value'),
    );
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getEnv: () => ({
          E2E_COOKIES: JSON.stringify([
            {
              name: 'session',
              value: 'top-secret-value',
              url: 'https://example.com',
            },
          ]),
        }),
      }),
    );

    const result = await runCollectedCase(
      collected([step('setCookies', { cookiesEnv: 'E2E_COOKIES' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].error?.message).toContain(
      'Failed to set 1 browser cookie',
    );
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
    expect(JSON.stringify(result)).not.toContain('top-secret-value');
  });

  it('redacts cookie profile resolution failures', async () => {
    const { page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getCookieProfile: () => {
          throw new Error('profile contains top-secret-value');
        },
      }),
    );

    const result = await runCollectedCase(
      collected([step('setCookies', { profile: 'member' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].error?.message).toContain(
      'Failed to resolve cookie profile member',
    );
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
    expect(JSON.stringify(result)).not.toContain('top-secret-value');
  });

  it('supports Cookie headers, profiles, and storage-state files', async () => {
    const { browserContext, page } = createPage();
    const directory = await mkdtemp(join(tmpdir(), 'midscene-test-cookies-'));
    temporaryDirectories.push(directory);
    const storageStatePath = join(directory, 'state.json');
    await writeFile(
      storageStatePath,
      JSON.stringify({
        cookies: [
          {
            name: 'stored',
            value: 'stored-secret',
            domain: '.example.com',
            path: '/',
          },
        ],
      }),
    );
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getEnv: () => ({ COOKIE_HEADER: 'a=1; b=two; ' }),
        getCookieProfile: ({ profile }) => [
          {
            name: profile,
            value: 'profile-secret',
            domain: '.example.com',
            path: '/',
          },
        ],
        resolveStorageStatePath: (path) =>
          path === 'state.json' ? storageStatePath : path,
      }),
    );

    for (const input of [
      {
        cookiesEnv: 'COOKIE_HEADER',
        url: 'https://example.com',
      },
      { profile: 'member' },
      { storageStatePath: 'state.json' },
    ]) {
      const result = await runCollectedCase(
        collected([step('setCookies', input)]),
        { resolveNode: registry.require.bind(registry), context: undefined },
      );
      expect(result.status).toBe('success');
    }

    expect(browserContext.addCookies).toHaveBeenNthCalledWith(1, [
      { name: 'a', value: '1', url: 'https://example.com/' },
      { name: 'b', value: 'two', url: 'https://example.com/' },
    ]);
    expect(browserContext.addCookies).toHaveBeenNthCalledWith(2, [
      {
        name: 'member',
        value: 'profile-secret',
        domain: '.example.com',
        path: '/',
      },
    ]);
    expect(browserContext.addCookies).toHaveBeenNthCalledWith(3, [
      {
        name: 'stored',
        value: 'stored-secret',
        domain: '.example.com',
        path: '/',
      },
    ]);
  });

  it('clears filtered cookies and sets the effective viewport', async () => {
    const { browserContext, page, pageMock } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({ getPage: () => page }),
    );
    const result = await runCollectedCase(
      collected([
        step('clearCookies', { domain: '.example.com' }),
        step('setViewportSize', { width: 1440, height: 900 }),
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.status).toBe('success');
    expect(browserContext.clearCookies).toHaveBeenCalledWith({
      domain: '.example.com',
    });
    expect(pageMock.setViewportSize).toHaveBeenCalledWith({
      width: 1440,
      height: 900,
    });
    expect(result.steps[1].output?.data).toEqual({
      width: 1440,
      height: 900,
    });
  });

  it('rejects relative navigation without baseUrl and invalid viewport sizes', async () => {
    const { page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({ getPage: () => page }),
    );

    const navigation = await runCollectedCase(
      collected([step('gotoUrl', { url: '/relative' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(navigation.steps[0].error?.message).toContain(
      'must be an absolute URL',
    );

    const viewport = await runCollectedCase(
      collected([step('setViewportSize', { width: 0, height: 900 })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(viewport.steps[0].error?.code).toBe('NODE_INPUT_VALIDATION_ERROR');
  });
});
