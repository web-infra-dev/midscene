import { ifInBrowser } from '@midscene/shared/utils';

export const SIWC_AUTH_STORAGE_KEY = 'midscene-siwc-auth';

interface SiwcAuth {
  created_at?: string;
  updated_at?: string;
  credentials: {
    access_token: string;
    expires_at: number;
    subject?: string;
    id_token?: string;
    client_id?: string;
    refresh_token?: string;
    [key: string]: unknown;
  };
}

// Keep Chrome types optional: Core also runs in Node.js and ordinary web pages.
type ChromeExtensionRuntime = {
  runtime?: { id?: string };
  storage?: {
    local?: {
      get(key: string): Promise<Record<string, SiwcAuth | undefined>>;
      set(value: Record<string, SiwcAuth>): Promise<void>;
    };
  };
};

export async function getCredentialStorage(): Promise<{
  read: () => Promise<SiwcAuth>;
  save: (record: SiwcAuth) => Promise<void>;
  reauthorizationHint: string;
}> {
  const chrome = (
    globalThis as typeof globalThis & { chrome?: ChromeExtensionRuntime }
  ).chrome;
  if (chrome?.runtime?.id && chrome.storage?.local) {
    const storage = chrome.storage.local;
    const reauthorizationHint =
      'Open Model Env Config and select "Use your ChatGPT plan" to sign in again. See https://midscenejs.com/chatgpt-subscription.html';
    return {
      read: async () => {
        const saved = await storage.get(SIWC_AUTH_STORAGE_KEY);
        const record = saved[SIWC_AUTH_STORAGE_KEY];
        if (
          typeof record?.credentials?.access_token !== 'string' ||
          !record.credentials.access_token.trim()
        ) {
          throw new Error(
            `SIWC credentials not found in this extension. ${reauthorizationHint}`,
          );
        }
        return record;
      },
      save: (updated) => storage.set({ [SIWC_AUTH_STORAGE_KEY]: updated }),
      reauthorizationHint,
    };
  }
  if (ifInBrowser) {
    throw new Error(
      'SIWC auth mode requires Node.js or the Midscene Chrome extension.',
    );
  }
  // Keep Node-only dependencies out of browser bundles.
  const fsModule = 'node:fs/promises';
  const osModule = 'node:os';
  const pathModule = 'node:path';
  const { readFile, writeFile, rename, rm } = await import(fsModule);
  const { homedir } = await import(osModule);
  const { join } = await import(pathModule);
  const credentialsPath = join(homedir(), '.midscene', 'siwc.json');
  const reauthorizationHint =
    'Run "midscene model siwc login" to sign in again. See https://midscenejs.com/chatgpt-subscription.html';
  return {
    read: async () => {
      const content = await readFile(credentialsPath, 'utf8').catch(
        (cause: NodeJS.ErrnoException) => {
          throw new Error(
            cause.code === 'ENOENT'
              ? `SIWC credentials not found at ${credentialsPath}. ${reauthorizationHint}`
              : `Unable to read SIWC credentials at ${credentialsPath}.`,
            { cause },
          );
        },
      );
      const record = (() => {
        try {
          return JSON.parse(content) as SiwcAuth;
        } catch {
          throw new Error(
            `Invalid JSON in SIWC credentials at ${credentialsPath}.`,
          );
        }
      })();
      if (
        typeof record?.credentials?.access_token !== 'string' ||
        !record.credentials.access_token.trim()
      ) {
        throw new Error(
          `Missing access token in ${credentialsPath}. ${reauthorizationHint}`,
        );
      }
      return record;
    },
    save: async (updated) => {
      // Replace atomically so another reader never sees a partially written JSON file.
      const temporary = `${credentialsPath}.${globalThis.crypto.randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, {
          mode: 0o600,
          flag: 'wx',
        });
        await rename(temporary, credentialsPath);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    reauthorizationHint,
  };
}
