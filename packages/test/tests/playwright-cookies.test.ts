import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createPlaywrightNodes } from '../src/playwright';
import {
  collected,
  createPage,
  errorChainText,
  step,
} from './playwright-node-helpers';

describe('Playwright cookie Nodes', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((path) => rm(path, { recursive: true, force: true })),
    );
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
    expect(errorChainText(result.steps[0].error)).not.toContain(
      'top-secret-value',
    );
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
  });

  it('redacts malformed environment JSON from the complete error chain', async () => {
    const secret = 'malformed-env-secret';
    const { page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getEnv: () => ({
          E2E_COOKIES: `[{"name":"session","value":"${secret}",}]`,
        }),
      }),
    );

    const result = await runCollectedCase(
      collected([step('setCookies', { cookiesEnv: 'E2E_COOKIES' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].error?.message).toContain(
      'source must contain valid JSON',
    );
    expect(errorChainText(result.steps[0].error)).not.toContain(secret);
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
  });

  it('redacts malformed storage-state JSON from the complete error chain', async () => {
    const secret = 'malformed-storage-secret';
    const directory = await mkdtemp(join(tmpdir(), 'midscene-test-cookies-'));
    temporaryDirectories.push(directory);
    const storageStatePath = join(directory, 'malformed-state.json');
    await writeFile(
      storageStatePath,
      `{"cookies":[{"name":"session","value":"${secret}",}]}`,
    );
    const { page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({ getPage: () => page }),
    );

    const result = await runCollectedCase(
      collected([step('setCookies', { storageStatePath })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].error?.message).toContain(
      'source must contain valid JSON',
    );
    expect(errorChainText(result.steps[0].error)).not.toContain(secret);
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
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
    expect(errorChainText(result.steps[0].error)).not.toContain(
      'top-secret-value',
    );
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
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
    expect(errorChainText(result.steps[0].error)).not.toContain(
      'top-secret-value',
    );
    expect((result.steps[0].error?.cause as Error | undefined)?.cause).toBe(
      undefined,
    );
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
      { cookiesEnv: 'COOKIE_HEADER', url: 'https://example.com' },
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
});
