import { statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkReplayHost } from '../dist/es/experimental.mjs';
import { describeError } from '../dist/es/tooling.mjs';
import { connectToTab, readTrialStorage, startUrl } from './browser.mjs';

/** A replay is an entry module, or a folder containing index.mjs. */
export function resolveReplayEntry(input) {
  return statSync(input).isDirectory() ? join(input, 'index.mjs') : input;
}

const importFile = (file) => import(pathToFileURL(file).href);

export async function loadReplayFlow(script, importEntry = importFile) {
  const flow = (await importEntry(script, 'replay')).default;
  if (
    !flow ||
    !Array.isArray(flow.steps) ||
    typeof flow.run !== 'function' ||
    !flow.meta
  )
    throw new Error(
      'INVALID_REPLAY: export default defineReplay({meta, steps}) from the script',
    );
  return flow;
}

export async function loadReplay(
  flow,
  {
    sessionFile,
    cdp,
    isolate = false,
    headless,
    generateReport,
    importEntry = importFile,
  },
) {
  const { meta } = flow;
  const platform = meta.platform;
  if (platform !== 'web') throw new Error('PLATFORM_UNSUPPORTED: expected web');

  const requires = meta.requires;
  if (
    requires !== undefined &&
    (!requires ||
      typeof requires !== 'object' ||
      Array.isArray(requires) ||
      Object.keys(requires).some(
        (key) => !['popups', 'minViewport'].includes(key),
      ) ||
      (requires.popups !== undefined && typeof requires.popups !== 'boolean'))
  )
    throw new Error('INVALID_REPLAY_REQUIREMENTS');

  const url = meta.startUrl === undefined ? undefined : startUrl(meta.startUrl);
  if (!sessionFile && !url)
    throw new Error(
      'START_URL_REQUIRED: export meta.startUrl or pass --session',
    );
  const session = sessionFile
    ? await importEntry(sessionFile, 'session')
    : defaultWebSession(url, {
        cdp,
        isolate,
        headless: headless ?? true,
        generateReport,
      });
  if (session.platform !== platform) throw new Error('PLATFORM_MISMATCH');
  if (
    ['open', 'reset', 'verifyStart'].some(
      (key) => typeof session[key] !== 'function',
    )
  )
    throw new Error('Session must implement open, reset and verifyStart');

  return {
    session,
    flow,
    hostConfig: sessionFile
      ? { platform, session: 'custom' }
      : {
          platform,
          session: cdp ? (isolate ? 'cdp-state' : 'cdp-tab') : 'default',
          engine: 'chromium',
          headless: cdp && !isolate ? false : (headless ?? true),
        },
    async prepare(host) {
      if (typeof host?.close !== 'function' || !host.agent)
        throw new Error('Session must return agent and close()');
      const { agent } = host;
      const params = (await session.getParams?.()) ?? {};
      await session.reset(agent, params);
      if ((await session.verifyStart(agent, params)) !== true)
        throw new Error('START_MISMATCH');
      await checkReplayHost(agent, requires);
      return { agent, params };
    },
  };
}

function defaultWebSession(url, { cdp, isolate, headless, generateReport }) {
  const useExistingTab = cdp && !isolate;
  let storageState;
  return {
    platform: 'web',
    async open({ outDir }) {
      const [{ chromium }, { PlaywrightBrowserAgent }] = await Promise.all([
        import('playwright'),
        import('@midscene/web/playwright'),
      ]);
      if (cdp && isolate) storageState ??= await readTrialStorage(cdp, url);
      const { browser, page } = useExistingTab
        ? await connectToTab(cdp, url)
        : { browser: await chromium.launch({ headless }) };
      try {
        const context =
          page?.context() ?? (await browser.newContext({ storageState }));
        const agent = await PlaywrightBrowserAgent.create(context, {
          initialPage: page,
          generateReport,
          testId: `replay-${basename(outDir)}`,
        });
        return {
          agent,
          async close() {
            try {
              await agent.destroy();
            } finally {
              await browser.close();
            }
          },
        };
      } catch (error) {
        await browser.close();
        throw error;
      }
    },
    async reset(agent) {
      if (!useExistingTab)
        await agent.activePage.goto(url, { waitUntil: 'domcontentloaded' });
    },
    async verifyStart(agent) {
      return new URL(agent.activePage.url()).href === url;
    },
  };
}

export function uncheckedChecks(session, reason = 'Script has not completed') {
  return Object.keys(session.checks ?? {}).map((name) => ({
    name,
    state: 'not_checked',
    reason,
  }));
}

export const partialChecksReason =
  'Whole-flow checks are skipped for partial or focused runs';

export async function collectChecks(session, agent, params) {
  const results = [];
  for (const [name, check] of Object.entries(session.checks ?? {})) {
    try {
      if (typeof check !== 'function')
        throw new Error(`Invalid check: ${name}`);
      const actual = await check(agent, params);
      if (typeof actual === 'boolean')
        results.push({ name, state: actual ? 'pass' : 'fail' });
      else if (
        actual &&
        ['pass', 'fail', 'pending', 'inconclusive', 'not_checked'].includes(
          actual.state,
        )
      )
        results.push({ ...actual, name });
      else
        throw new Error(
          'CHECK_NO_RESULT: return a boolean or explicit check result',
        );
    } catch (error) {
      results.push({
        name,
        state: error?.code === 'ERR_ASSERTION' ? 'fail' : 'error',
        error: describeError(error, 'check'),
      });
    }
  }
  return results;
}
