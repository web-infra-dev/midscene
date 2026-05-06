import { createRequire } from 'node:module';
import type {
  PlaygroundCreatedSession,
  PlaygroundPreviewDescriptor,
  PlaygroundSessionManager,
  PreparedPlaygroundPlatform,
} from '@midscene/playground';
import type { Browser, Page } from 'puppeteer-core';
import type { WebViewManager, WebViewSession } from './web-view-manager';

const require = createRequire(__filename);

/**
 * Stub preview descriptor for the web platform.
 *
 * The renderer detects `metadata.previewKind === 'electron-web-view'` and
 * mounts {@link WebPreviewSlot}, which positions the native WebContentsView
 * on top of the React tree — `/screenshot` is never actually fetched. We
 * still emit `kind: 'screenshot'` because {@link PlaygroundPreviewDescriptor}
 * does not yet have a `'native-view'` variant. When the upstream union
 * grows one, switch this over and drop the renderer's metadata-based
 * branching.
 *
 * Inlined here (rather than imported from `@midscene/playground`) because
 * importing that package transitively loads `@midscene/shared`'s image
 * pipeline, which fails to pre-bundle under vitest's vite resolution.
 */
function buildWebPreviewStub(title: string): PlaygroundPreviewDescriptor {
  return {
    kind: 'screenshot',
    title,
    screenshotPath: '/screenshot',
    capabilities: [
      { kind: 'screenshot', label: 'Screenshot polling', live: false },
    ],
  };
}

interface WebPlatformDeps {
  webViewManager: WebViewManager;
  cdpPort: number;
  /** Override hook for tests; production uses the real puppeteer-core. */
  connectBrowser?: (browserURL: string) => Promise<Browser>;
}

const PLATFORM_ID = 'web';
const PLATFORM_LABEL = 'Web';
const PLATFORM_DESCRIPTION = 'Browse and automate web pages inside Studio';

type PuppeteerCoreModule = typeof import('puppeteer-core');
type WebPuppeteerModule = typeof import('@midscene/web/puppeteer');
type PuppeteerAgentPage = ConstructorParameters<
  WebPuppeteerModule['PuppeteerAgent']
>[0];

async function defaultConnectBrowser(browserURL: string): Promise<Browser> {
  const puppeteer: PuppeteerCoreModule = require('puppeteer-core');
  return puppeteer.connect({ browserURL, defaultViewport: null });
}

async function findPageByUrl(
  browser: Browser,
  expectedUrl: string,
): Promise<Page> {
  // Compare on the canonical form so trailing-slash drift doesn't sink the
  // match. Puppeteer reports `target.url()` as Chromium's normalized form.
  const normalize = (value: string) => {
    try {
      return new URL(value).toString();
    } catch {
      return value;
    }
  };
  const expected = normalize(expectedUrl);
  const pages = await browser.pages();
  const pageTargets = pages.filter((page) => page.target().type() === 'page');
  for (const page of pageTargets) {
    if (normalize(page.target().url()) === expected) {
      return page;
    }
  }
  if (pageTargets.length > 0) {
    // Fallback: take the most recent page target. Studio only opens a single
    // web view at a time, so this is unambiguous in MVP.
    return pageTargets[pageTargets.length - 1];
  }
  throw new Error(
    `puppeteer connected but no page targets were found for url ${expectedUrl}`,
  );
}

async function buildAgentFactory(
  session: WebViewSession,
  deps: WebPlatformDeps,
) {
  const connect = deps.connectBrowser ?? defaultConnectBrowser;
  const browserURL = `http://127.0.0.1:${deps.cdpPort}`;
  const browser = await connect(browserURL);
  const page = await findPageByUrl(browser, session.url);

  // require() (not dynamic import) keeps the dep out of vite's static
  // analysis, matching how the rest of multi-platform-runtime loads
  // platform modules.
  const webPuppeteer: WebPuppeteerModule = require('@midscene/web/puppeteer');
  const { PuppeteerAgent } = webPuppeteer;
  // PuppeteerAgent's first parameter is typed as the `Page` from
  // `puppeteer`, while we hold a structurally identical `Page` from
  // `puppeteer-core`. The cast routes through the constructor's declared
  // type so it still tracks signature changes (unlike `as unknown as never`).
  return new PuppeteerAgent(page as unknown as PuppeteerAgentPage, {
    forceSameTabNavigation: true,
  });
}

export function buildWebPlaygroundPlatform(
  deps: WebPlatformDeps,
): PreparedPlaygroundPlatform {
  const sessionManager: PlaygroundSessionManager = {
    async getSetupSchema() {
      const existing = deps.webViewManager.getSession();
      return {
        title: 'Open a web page',
        description:
          'Studio embeds a Chromium view here. Enter a URL to start the session.',
        primaryActionLabel: 'Open',
        autoSubmitWhenReady: false,
        fields: [
          {
            key: 'url',
            label: 'URL',
            type: 'text',
            required: true,
            placeholder: 'https://example.com',
            defaultValue: existing?.url ?? '',
          },
        ],
        targets: existing
          ? [
              {
                id: existing.id,
                label: existing.title || existing.url,
                description: existing.url,
                isDefault: true,
              },
            ]
          : [],
      };
    },

    async listTargets() {
      const existing = deps.webViewManager.getSession();
      return existing
        ? [
            {
              id: existing.id,
              label: existing.title || existing.url,
              description: existing.url,
              isDefault: true,
            },
          ]
        : [];
    },

    async createSession(input): Promise<PlaygroundCreatedSession> {
      const url = typeof input?.url === 'string' ? input.url.trim() : '';
      if (!url) {
        throw new Error('A URL is required to start a Web session.');
      }

      const session = await deps.webViewManager.openSession(url);
      const agent = await buildAgentFactory(session, deps);

      return {
        agent,
        agentFactory: () => buildAgentFactory(session, deps),
        displayName: session.title || session.url,
        platformId: PLATFORM_ID,
        // The WebContentsView IS the live preview, so the playground UI
        // doesn't need to draw screenshots — but we still expose the
        // descriptor so the runtime treats this as a screenshot-capable
        // session for any feature that relies on it.
        preview: buildWebPreviewStub('Web preview'),
        metadata: {
          sessionId: session.id,
          url: session.url,
          webContentsId: session.webContentsId,
          previewKind: 'electron-web-view',
        },
      };
    },

    async destroySession() {
      await deps.webViewManager.closeSession();
    },
  };

  return {
    platformId: PLATFORM_ID,
    title: PLATFORM_LABEL,
    description: PLATFORM_DESCRIPTION,
    sessionManager,
    metadata: {
      sessionConnected: false,
      setupState: 'required',
      previewKind: 'electron-web-view',
    },
    preview: buildWebPreviewStub('Web preview'),
  };
}
