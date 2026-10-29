import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTestProject } from '@midscene/test/config';
import {
  type Browser,
  type BrowserContext,
  type Page,
  chromium,
} from 'playwright';
import { executablePath } from 'puppeteer';
import { expect, it } from 'vitest';

it('isolates real browser sessions per file and closes them before the shared Browser', async () => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-file-browser-'));
  const sessions: BrowserContext[] = [];
  const pages: Page[] = [];
  const events: string[] = [];
  let browser: Browser | undefined;
  let peak = 0;
  let started = 0;
  let release!: () => void;
  const firstTwo = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = {
    async setup(onTeardown: (callback: () => Promise<void>) => void) {
      browser = await chromium.launch({
        headless: true,
        executablePath: executablePath(),
      });
      events.push('browser-created');
      onTeardown(async () => {
        expect(browser!.contexts()).toHaveLength(0);
        await browser!.close();
        events.push('browser-closed');
      });
      return { browser };
    },
    async fileSetup(
      shared: { browser: Browser },
      key: string,
      onTeardown: (callback: () => Promise<void>) => void,
    ) {
      const session = await shared.browser.newContext();
      sessions.push(session);
      peak = Math.max(peak, shared.browser.contexts().length);
      onTeardown(async () => {
        await session.close();
        events.push(`closed:${key}`);
      });
      const page = await session.newPage();
      pages.push(page);
      await session.addCookies([
        { name: 'file', value: key, url: 'http://example.test/' },
      ]);
      await page.goto('data:text/html,<title>Independent file</title>');
      return { session, page, key };
    },
    async check({
      session,
      page,
      key,
    }: { session: BrowserContext; page: Page; key: string }) {
      if (++started === 2) release();
      await firstTwo;
      expect(await session.cookies()).toMatchObject([
        { name: 'file', value: key },
      ]);
      expect(await page.title()).toBe('Independent file');
      events.push(`checked:${key}`);
    },
  };
  (globalThis as Record<string, unknown>).__midsceneBrowserConcurrency = state;
  try {
    for (let i = 1; i <= 3; i++)
      writeFileSync(
        join(root, `${i}.yaml`),
        'cases:\n  - name: browser isolation\n    steps:\n      - check: {}\n',
      );
    writeFileSync(
      join(root, 'midscene.config.mjs'),
      `
      const s = globalThis.__midsceneBrowserConcurrency;
      export default {
        test: { maxConcurrentFiles: 3 },
        projects: [{ name: 'web', maxConcurrentFiles: 2,
          setup: { name: 'browser', setup: ({ onTeardown }) => s.setup(onTeardown) },
          fileSetup: { name: 'page', setup: ({ projectContext, file, onTeardown }) =>
            s.fileSetup(projectContext, file.sourcePath, onTeardown) },
          files: { include: ['*.yaml'] },
        }],
        nodes: [{ name: 'check', execute: ({ context }) => s.check(context) }],
      };
    `,
    );
    const result = await runTestProject({ projectRoot: root });
    expect(
      result.status,
      JSON.stringify({
        projects: result.projects.map(({ lifecycle }) => lifecycle),
        errors: result.collectionErrors,
        documents: result.documents.map(
          ({ hostErrors, beforeAll, afterAll }) => ({
            hostErrors,
            beforeAll,
            afterAll,
          }),
        ),
        cases: result.cases.map(({ run }) => run?.steps),
      }),
    ).toBe('success');
    expect(result.cases).toHaveLength(3);
    expect(peak).toBe(2);
    expect(new Set(sessions).size).toBe(3);
    expect(new Set(pages).size).toBe(3);
    expect(events.filter((event) => event.startsWith('checked:'))).toHaveLength(
      3,
    );
    expect(events.filter((event) => event.startsWith('closed:'))).toHaveLength(
      3,
    );
    expect(events[0]).toBe('browser-created');
    expect(events.at(-1)).toBe('browser-closed');
    expect(browser!.isConnected()).toBe(false);
  } finally {
    release();
    await browser?.close();
    (globalThis as Record<string, unknown>).__midsceneBrowserConcurrency =
      undefined;
    rmSync(root, { recursive: true, force: true });
  }
});
