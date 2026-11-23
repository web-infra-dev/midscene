import { statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkReplayHost, withReplay } from '../dist/es/experimental.mjs';
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
    reuseTab = false,
    headless,
    generateReport,
    checkStartLandmark = true,
    importEntry = importFile,
  },
) {
  const { meta } = flow;
  const platform = meta.platform;
  if (platform !== 'web') throw new Error('PLATFORM_UNSUPPORTED: expected web');

  const { requires, ready } = meta;
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
  if (
    ready !== undefined &&
    (typeof ready?.xpath !== 'string' ||
      !ready.xpath.trim() ||
      (ready.timeoutMs !== undefined &&
        (!Number.isFinite(ready.timeoutMs) || ready.timeoutMs < 0)))
  )
    throw new Error(
      'INVALID_REPLAY_READY: expected xpath and optional timeoutMs',
    );

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
        reuseTab,
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
  const isolation = sessionFile
    ? {
        browserContext: session.isolation?.browserContext ?? 'unknown',
        tab: session.isolation?.tab ?? 'unknown',
        businessState: session.isolation?.businessState ?? 'unknown',
      }
    : {
        browserContext: cdp && !isolate ? 'shared' : 'fresh',
        tab: cdp && !isolate ? 'reused' : 'new',
        businessState: 'not-reset',
      };
  if (
    !['fresh', 'shared', 'unknown'].includes(isolation.browserContext) ||
    !['new', 'reused', 'unknown'].includes(isolation.tab) ||
    !['reset', 'not-reset', 'unknown'].includes(isolation.businessState) ||
    (isolation.tab === 'reused' && isolation.browserContext === 'fresh')
  )
    throw new Error('INVALID_SESSION_ISOLATION');

  return {
    session,
    flow,
    hostConfig: {
      platform,
      session: sessionFile
        ? 'custom'
        : cdp
          ? isolate
            ? 'cdp-state'
            : 'cdp-tab'
          : 'default',
      ...isolation,
      ...(sessionFile
        ? {}
        : {
            engine: 'chromium',
            ...(cdp && !isolate ? {} : { headless: headless ?? true }),
          }),
    },
    async dispose() {
      if (reuseTab) await session.disconnect();
    },
    async prepare(host, setStage = () => {}) {
      if (typeof host?.close !== 'function' || !host.agent)
        throw new Error('Session must return agent and close()');
      const { agent } = host;
      const params = (await session.getParams?.()) ?? {};
      setStage(sessionFile ? 'reset' : 'navigation');
      await session.reset(agent, params);
      setStage(sessionFile ? 'application-ready' : 'start-url');
      if ((await session.verifyStart(agent, params)) !== true)
        throw new Error('START_MISMATCH');
      setStage('application-ready');
      if (ready && checkStartLandmark)
        await withReplay(agent).expect(
          { xpath: ready.xpath },
          { visible: true },
          { timeoutMs: ready.timeoutMs ?? 5000 },
        );
      await checkReplayHost(agent, requires);
      return { agent, params };
    },
  };
}

function defaultWebSession(
  url,
  { cdp, isolate, reuseTab, headless, generateReport },
) {
  const useExistingTab = cdp && !isolate;
  let storageState;
  let liveTab;
  return {
    platform: 'web',
    async disconnect() {
      await liveTab?.browser.close();
    },
    async open({ outDir }) {
      const [{ chromium }, { PlaywrightBrowserAgent }] = await Promise.all([
        import('playwright'),
        import('@midscene/web/playwright/agent'),
      ]);
      if (cdp && isolate) storageState ??= await readTrialStorage(cdp, url);
      if (reuseTab) liveTab ??= await connectToTab(cdp, url);
      const { browser, page } = useExistingTab
        ? (liveTab ?? (await connectToTab(cdp, url)))
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
              if (!reuseTab) await browser.close();
            }
          },
        };
      } catch (error) {
        if (!reuseTab) await browser.close();
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
