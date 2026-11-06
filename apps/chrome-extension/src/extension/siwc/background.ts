import { SIWC_AUTH_STORAGE_KEY } from '@midscene/core/ai-model';
import {
  type LoginSession,
  SIWC_SESSION_KEY,
  createAuthorization,
  exchangeCode,
  parseCallback,
} from './auth';

const HOST_KEY = 'midscene-siwc-host-id';
const ALARM = 'midscene-siwc-timeout';
// Serializes start and callback handling, including duplicate redirect events.
const busy = { value: false };

export async function startSiwcLogin() {
  if (busy.value) {
    throw new Error('SIWC authorization is already in progress.');
  }
  busy.value = true;
  try {
    const existing = (await chrome.storage.session.get(SIWC_SESSION_KEY))[
      SIWC_SESSION_KEY
    ] as LoginSession | undefined;
    if (
      existing &&
      ['waiting', 'exchanging'].includes(existing.status) &&
      existing.attempt.expiresAt > Date.now()
    ) {
      throw new Error(
        'SIWC authorization is already in progress. Finish or close its tab first.',
      );
    }
    const saved = await chrome.storage.local.get([
      HOST_KEY,
      SIWC_AUTH_STORAGE_KEY,
    ]);
    const hostId = saved[HOST_KEY] ?? `urn:uuid:${crypto.randomUUID()}`;
    await chrome.storage.local.set({ [HOST_KEY]: hostId });
    // Create the tab first so its ID is persisted before authorization starts.
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    if (tab.id === undefined) {
      throw new Error('Unable to create the SIWC authorization tab.');
    }
    const tabId = tab.id;
    try {
      const { attempt, url } = await createAuthorization(
        tabId,
        hostId,
        saved[SIWC_AUTH_STORAGE_KEY]?.credentials?.client_id,
      );
      await chrome.storage.session.set({
        [SIWC_SESSION_KEY]: {
          attempt,
          status: 'waiting',
        } satisfies LoginSession,
      });
      await chrome.alarms.create(ALARM, { when: attempt.expiresAt });
      await chrome.tabs.update(tabId, { url, active: true });
    } catch (error) {
      await chrome.storage.session.remove(SIWC_SESSION_KEY);
      await chrome.alarms.clear(ALARM);
      await chrome.tabs.remove(tabId);
      throw error;
    }
  } finally {
    busy.value = false;
  }
}

export async function captureSiwcCallback(url: string, tabId: number) {
  if (!url.startsWith('http://127.0.0.1:')) {
    return;
  }
  if (busy.value) {
    return;
  }
  busy.value = true;
  try {
    const session = (await chrome.storage.session.get(SIWC_SESSION_KEY))[
      SIWC_SESSION_KEY
    ] as LoginSession | undefined;
    if (!session || session.status !== 'waiting') {
      return;
    }
    try {
      const callback = parseCallback(url, tabId, session.attempt);
      if (!callback) {
        return;
      }
      await chrome.storage.session.set({
        [SIWC_SESSION_KEY]: { ...session, status: 'exchanging' },
      });
      // No OAuth parameters are forwarded to the extension page URL.
      await chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('siwc.html'),
      });
      const credentials = await exchangeCode(session.attempt, callback);
      const now = new Date().toISOString();
      await chrome.storage.local.set({
        [SIWC_AUTH_STORAGE_KEY]: {
          created_at: now,
          updated_at: now,
          credentials,
        },
      });
      await chrome.storage.session.set({
        [SIWC_SESSION_KEY]: { ...session, status: 'success' },
      });
    } catch (error) {
      await chrome.storage.session.set({
        [SIWC_SESSION_KEY]: {
          ...session,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('siwc.html'),
      });
    }
  } finally {
    busy.value = false;
  }
}

export function registerSiwcListeners() {
  const capture = (url: string, tabId: number) => {
    void captureSiwcCallback(url, tabId).catch((error) =>
      console.error('SIWC callback handling failed:', error),
    );
  };
  // Capture the Location header before the browser attempts the loopback request.
  chrome.webRequest.onBeforeRedirect.addListener(
    (details) => capture(details.redirectUrl, details.tabId),
    { urls: ['https://auth.openai.com/*'], types: ['main_frame'] },
  );
  // Fallback for client-side navigation, or redirects from another auth host.
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => capture(details.url, details.tabId),
    { urls: ['http://127.0.0.1/*'], types: ['main_frame'] },
  );
  chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.get(SIWC_SESSION_KEY).then(async (saved) => {
      if (saved[SIWC_SESSION_KEY]?.attempt.tabId === tabId) {
        await chrome.storage.session.remove(SIWC_SESSION_KEY);
      }
    });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM) {
      return;
    }
    void chrome.storage.session.get(SIWC_SESSION_KEY).then(async (saved) => {
      const session = saved[SIWC_SESSION_KEY] as LoginSession | undefined;
      if (
        session &&
        ['waiting', 'exchanging'].includes(session.status) &&
        session.attempt.expiresAt <= Date.now()
      ) {
        await chrome.storage.session.set({
          [SIWC_SESSION_KEY]: {
            ...session,
            status: 'error',
            error: 'Authorization timed out. Start authorization again.',
          },
        });
      }
    });
  });
}
