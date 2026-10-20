import { ifInBrowser } from '@midscene/shared/utils';
import type { ModelRuntime } from '../../models';
import type { CallAIOptions } from '../types';

export const SIWC_AUTH_STORAGE_KEY = 'midscene-siwc-auth';

// Keep Chrome types optional: Core also runs in Node.js and ordinary web pages.
type ChromeExtensionRuntime = {
  runtime?: { id?: string };
  storage?: {
    local?: {
      get(
        key: string,
      ): Promise<
        Record<string, { credentials?: { access_token?: unknown } } | undefined>
      >;
    };
  };
};

/**
 * Read on each request so a manual login or refresh takes effect without
 * restarting the process. Expiration checks and automatic refresh are separate.
 */
export async function readSiwcAccessToken(): Promise<string> {
  const chrome = (
    globalThis as typeof globalThis & { chrome?: ChromeExtensionRuntime }
  ).chrome;
  if (chrome?.runtime?.id && chrome.storage?.local) {
    // Shared storage contract with the Midscene extension's SIWC login flow.
    const saved = await chrome.storage.local.get(SIWC_AUTH_STORAGE_KEY);
    const token = saved[SIWC_AUTH_STORAGE_KEY]?.credentials?.access_token;
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error(
        'SIWC credentials not found in this extension. Open Model Env Config and select "Use your ChatGPT plan" to sign in first. See https://midscenejs.com/chatgpt-subscription.html',
      );
    }
    return token;
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
  const { readFile } = await import(fsModule);
  const { homedir } = await import(osModule);
  const { join } = await import(pathModule);
  const credentialsPath = join(homedir(), '.midscene', 'siwc.json');
  const content = await readFile(credentialsPath, 'utf8').catch(
    (cause: NodeJS.ErrnoException) => {
      throw new Error(
        cause.code === 'ENOENT'
          ? `SIWC credentials not found at ${credentialsPath}. Run "midscene model siwc login" first. See https://midscenejs.com/chatgpt-subscription.html`
          : `Unable to read SIWC credentials at ${credentialsPath}.`,
        { cause },
      );
    },
  );
  const record = (() => {
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(
        `Invalid JSON in SIWC credentials at ${credentialsPath}.`,
      );
    }
  })();
  const token = record?.credentials?.access_token;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error(
      `Missing access token in ${credentialsPath}. Run "midscene model siwc login" first. See https://midscenejs.com/chatgpt-subscription.html`,
    );
  }
  return token;
}

/** Build effective request settings without mutating the user's configuration. */
export async function prepareSiwcCall(
  modelRuntime: ModelRuntime,
  options?: CallAIOptions,
): Promise<{ modelRuntime: ModelRuntime; options?: CallAIOptions }> {
  if (modelRuntime.config.authMode !== 'siwc') {
    return { modelRuntime, options };
  }
  const baseURL = 'https://api.openai.com/v1';
  const apiKey = await readSiwcAccessToken();
  return {
    modelRuntime: {
      ...modelRuntime,
      config: {
        ...modelRuntime.config,
        openaiBaseURL: baseURL,
        openaiApiKey: apiKey,
        openaiExtraConfig: {
          ...modelRuntime.config.openaiExtraConfig,
          baseURL,
          apiKey,
        },
        protocol: 'openai-responses',
        streamMode: 'stream',
      },
    },
    options: { ...options, stream: true },
  };
}
