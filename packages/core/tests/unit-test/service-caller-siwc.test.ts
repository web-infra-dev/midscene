import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os' with { rstest: 'importActual' };
import { join } from 'node:path';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import {
  SIWC_AUTH_STORAGE_KEY,
  siwcTokenManager,
} from '@/ai-model/service-caller/openai/siwc';
import { ModelConfigManager } from '@midscene/shared/env';
import { afterEach, beforeEach, expect, it, rs } from '@rstest/core';

const directories: string[] = [];
const fetchMock = rs.fn<typeof fetch>();
const saveToken = async (token: unknown) => {
  await writeFile(
    join(os.homedir(), '.midscene', 'siwc.json'),
    JSON.stringify({
      credentials: { access_token: token, expires_at: Date.now() + 3600_000 },
    }),
  );
};

beforeEach(async () => {
  const home = await mkdtemp(join(os.tmpdir(), 'midscene-siwc-test-'));
  directories.push(home);
  rs.spyOn(os, 'homedir').mockReturnValue(home);
  syncBuiltinESMExports();
  await mkdir(join(home, '.midscene'));
  fetchMock.mockReset();
  rs.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  rs.unstubAllGlobals();
  rs.restoreAllMocks();
  syncBuiltinESMExports();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it('reads the current token without caching credentials', async () => {
  await saveToken('first');
  expect(await siwcTokenManager.getAccessToken()).toBe('first');
  await saveToken('second');
  expect(await siwcTokenManager.getAccessToken()).toBe('second');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('reports missing, malformed and incomplete credentials without logging in', async () => {
  await expect(siwcTokenManager.getAccessToken()).rejects.toThrow('siwc login');
  await writeFile(join(os.homedir(), '.midscene', 'siwc.json'), '{broken');
  await expect(siwcTokenManager.getAccessToken()).rejects.toThrow(
    'Invalid JSON',
  );
  await saveToken('');
  await expect(siwcTokenManager.getAccessToken()).rejects.toThrow(
    'Missing access token',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([undefined, 1, Date.now() + 3600_000])(
  'reads the token without checking local expiration: %s',
  async (expires_at) => {
    await writeFile(
      join(os.homedir(), '.midscene', 'siwc.json'),
      JSON.stringify({
        credentials: { access_token: 'saved-access', expires_at },
      }),
    );
    expect(await siwcTokenManager.getAccessToken()).toBe('saved-access');
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it.each(['file', 'extension'])(
  'uses %s credentials and streaming Responses despite conflicting settings',
  async (source) => {
    if (source === 'extension') {
      rs.stubGlobal('chrome', {
        runtime: { id: 'midscene-extension' },
        storage: {
          local: {
            get: async () => ({
              [SIWC_AUTH_STORAGE_KEY]: {
                credentials: {
                  access_token: 'saved-token',
                  expires_at: Date.now() + 3600_000,
                },
              },
            }),
          },
        },
      });
    } else {
      await saveToken('saved-token');
    }
    const response = {
      id: 'resp-test',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
    fetchMock.mockImplementation(
      async () =>
        new Response(
          `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const config = new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'test-model',
      MIDSCENE_MODEL_FAMILY: 'gpt-5',
      MIDSCENE_MODEL_AUTH_MODE: 'siwc',
      MIDSCENE_MODEL_BASE_URL: 'codex://app-server',
      MIDSCENE_MODEL_API_KEY: 'unused',
      MIDSCENE_MODEL_PROTOCOL: 'openai-chat',
      MIDSCENE_MODEL_STREAM_MODE: 'non-stream',
      MIDSCENE_MODEL_INIT_CONFIG_JSON: JSON.stringify({
        baseURL: 'https://example.test/v1',
        apiKey: 'also-unused',
      }),
    }).getModelConfig('default');
    const result = await callAI(
      [{ role: 'user', content: 'Hello' }],
      getModelRuntime(config),
      { stream: false },
    );
    expect(result.content).toBe('Hello');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer saved-token',
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: true,
      store: false,
    });
    expect(config).toMatchObject({
      openaiApiKey: 'unused',
      openaiBaseURL: 'codex://app-server',
      protocol: 'openai-chat',
      streamMode: 'non-stream',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it('does not attempt token refresh after an authentication failure', async () => {
  await saveToken('expired-token');
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { message: 'Token expired', type: 'authentication_error' },
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ),
  );
  const config = new ModelConfigManager({
    MIDSCENE_MODEL_NAME: 'test-model',
    MIDSCENE_MODEL_AUTH_MODE: 'siwc',
    MIDSCENE_MODEL_FAMILY: 'gpt-5',
    MIDSCENE_MODEL_RETRY_COUNT: 0,
  }).getModelConfig('default');
  await expect(
    callAI([{ role: 'user', content: 'Hello' }], getModelRuntime(config)),
  ).rejects.toThrow('Token expired');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await siwcTokenManager.getAccessToken()).toBe('expired-token');
});

it('reads extension storage on every call and propagates errors', async () => {
  const get = rs
    .fn()
    .mockResolvedValueOnce({
      [SIWC_AUTH_STORAGE_KEY]: {
        credentials: {
          access_token: 'first',
          expires_at: Date.now() + 3600_000,
        },
      },
    })
    .mockResolvedValueOnce({
      [SIWC_AUTH_STORAGE_KEY]: {
        credentials: {
          access_token: 'second',
          expires_at: Date.now() + 3600_000,
        },
      },
    })
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('Storage unavailable'));
  rs.stubGlobal('chrome', {
    runtime: { id: 'midscene-extension' },
    storage: { local: { get } },
  });
  expect(await siwcTokenManager.getAccessToken()).toBe('first');
  expect(await siwcTokenManager.getAccessToken()).toBe('second');
  await expect(siwcTokenManager.getAccessToken()).rejects.toThrow(
    'Use your ChatGPT plan',
  );
  await expect(siwcTokenManager.getAccessToken()).rejects.toThrow(
    'Storage unavailable',
  );
  expect(get).toHaveBeenCalledWith(SIWC_AUTH_STORAGE_KEY);
});

it('does not mistake a browser chrome object for extension storage', async () => {
  const get = rs.fn();
  rs.stubGlobal('chrome', { storage: { local: { get } } });
  await saveToken('node-token');
  expect(await siwcTokenManager.getAccessToken()).toBe('node-token');
  expect(get).not.toHaveBeenCalled();
});

const expiredRecord = () => ({
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  credentials: {
    access_token: 'old-access',
    refresh_token: 'old-refresh',
    client_id: 'test-client',
    expires_at: Date.now() - 1000,
    ext_agent_host_id: 'host',
    subject: 'account',
  },
});
const refreshedTokens = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'chatgpt.tokens.use.direct',
};

it.each(['file', 'extension'])(
  'refreshes rejected %s credentials once for concurrent requests and persists rotation',
  async (source) => {
    const record = expiredRecord();
    const path = join(os.homedir(), '.midscene', 'siwc.json');
    const storage = { [SIWC_AUTH_STORAGE_KEY]: record };
    const set = rs.fn(async (value) => {
      Object.assign(storage, value);
    });
    if (source === 'extension') {
      rs.stubGlobal('chrome', {
        runtime: { id: 'extension' },
        storage: {
          local: {
            get: async () => storage,
            set,
          },
        },
      });
    } else {
      await writeFile(path, JSON.stringify(record));
    }
    fetchMock.mockResolvedValue(Response.json(refreshedTokens));
    expect(
      await Promise.all(
        Array.from({ length: 5 }, () =>
          siwcTokenManager.refreshAccessToken('old-access'),
        ),
      ),
    ).toEqual(Array(5).fill('new-access'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://auth.openai.com/api/accounts/oauth/token');
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      grant_type: 'refresh_token',
      client_id: 'test-client',
      refresh_token: 'old-refresh',
      resource: 'https://api.openai.com/v1',
    });
    const saved =
      source === 'extension'
        ? storage[SIWC_AUTH_STORAGE_KEY]
        : JSON.parse(await readFile(path, 'utf8'));
    expect(saved).toMatchObject({
      created_at: record.created_at,
      credentials: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        subject: 'account',
        ext_agent_host_id: 'host',
      },
    });
    expect(saved.credentials.expires_at).toBeGreaterThan(Date.now());
    expect(saved.updated_at).not.toBe(record.updated_at);
    if (source === 'file') {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect(await siwcTokenManager.refreshAccessToken('old-access')).toBe(
      'new-access',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it.each(['rejected', 'invalid', 'network'])(
  'preserves credentials on %s refresh and permits a later retry',
  async (failure) => {
    const path = join(os.homedir(), '.midscene', 'siwc.json');
    const content = JSON.stringify(expiredRecord());
    await writeFile(path, content);
    if (failure === 'network') {
      fetchMock.mockRejectedValueOnce(new Error('Network unavailable'));
    } else {
      fetchMock.mockResolvedValueOnce(
        failure === 'rejected'
          ? new Response('invalid_grant', { status: 400 })
          : Response.json({ ...refreshedTokens, expires_in: -1 }),
      );
    }
    await expect(
      siwcTokenManager.refreshAccessToken('old-access'),
    ).rejects.toThrow('siwc login');
    expect(await readFile(path, 'utf8')).toBe(content);
    fetchMock.mockResolvedValueOnce(Response.json(refreshedTokens));
    expect(await siwcTokenManager.refreshAccessToken('old-access')).toBe(
      'new-access',
    );
  },
);

it('does not return the refreshed token if persistence fails', async () => {
  rs.stubGlobal('chrome', {
    runtime: { id: 'extension' },
    storage: {
      local: {
        get: async () => ({ [SIWC_AUTH_STORAGE_KEY]: expiredRecord() }),
        set: async () => {
          throw new Error('Storage unavailable');
        },
      },
    },
  });
  fetchMock.mockResolvedValueOnce(Response.json(refreshedTokens));
  await expect(
    siwcTokenManager.refreshAccessToken('old-access'),
  ).rejects.toThrow('Storage unavailable');
});

const tokenExpiredResponse = () =>
  Response.json(
    {
      error: {
        code: 'token_expired',
        message: 'Token expired',
        type: 'invalid_request_error',
      },
    },
    { status: 401 },
  );

const successfulStream = () =>
  new Response(
    [
      { type: 'response.output_text.delta', delta: 'OK' },
      {
        type: 'response.completed',
        response: {
          id: 'resp-refreshed',
          status: 'completed',
          model: 'test-model',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'OK' }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );

async function prepareRejectedTokenTest(retryCount = 0) {
  const record = expiredRecord();
  record.credentials.expires_at = Date.now() + 3600_000;
  await writeFile(
    join(os.homedir(), '.midscene', 'siwc.json'),
    JSON.stringify(record),
  );
  return getModelRuntime(
    new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'test-model',
      MIDSCENE_MODEL_FAMILY: 'gpt-5',
      MIDSCENE_MODEL_AUTH_MODE: 'siwc',
      MIDSCENE_MODEL_RETRY_COUNT: String(retryCount),
    }).getModelConfig('default'),
  );
}

it('refreshes on token_expired despite local expiry and streams the retried output once', async () => {
  const runtime = await prepareRejectedTokenTest();
  fetchMock
    .mockResolvedValueOnce(tokenExpiredResponse())
    .mockResolvedValueOnce(Response.json(refreshedTokens))
    .mockResolvedValueOnce(successfulStream());
  const onChunk = rs.fn();
  const result = await callAI([{ role: 'user', content: 'Hello' }], runtime, {
    onChunk,
  });
  expect(result.content).toBe('OK');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(
    new Headers(fetchMock.mock.calls[2][1]?.headers).get('authorization'),
  ).toBe('Bearer new-access');
  expect(onChunk.mock.calls.filter(([chunk]) => chunk.content)).toHaveLength(1);
});

it('cancels a caller waiting for refresh without cancelling the shared refresh', async () => {
  const runtime = await prepareRejectedTokenTest();
  const controller = new AbortController();
  const gate: {
    resolve?: (response: Response) => void;
    signal?: AbortSignal | null;
  } = {};
  const response = new Promise<Response>((resolve) => {
    gate.resolve = resolve;
  });
  fetchMock
    .mockResolvedValueOnce(tokenExpiredResponse())
    .mockImplementationOnce(async (_url, init) => {
      gate.signal = init?.signal;
      return response;
    });
  const request = callAI([{ role: 'user', content: 'Hello' }], runtime, {
    abortSignal: controller.signal,
  });
  const cancelled = expect(request).rejects.toThrow('Cancelled during refresh');
  await rs.waitFor(() => expect(gate.signal).toBeDefined());
  const otherCaller = siwcTokenManager.refreshAccessToken('old-access');
  try {
    controller.abort(new Error('Cancelled during refresh'));
    // This must settle while the refresh response is still pending.
    await cancelled;
    expect(gate.signal?.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    gate.resolve!(Response.json(refreshedTokens));
    await otherCaller;
  }
  expect(await otherCaller).toBe('new-access');
  expect(await siwcTokenManager.getAccessToken()).toBe('new-access');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([401, 500])(
  'does not retry again when the refreshed request fails with %s',
  async (status) => {
    const runtime = await prepareRejectedTokenTest(3);
    fetchMock
      .mockResolvedValueOnce(tokenExpiredResponse())
      .mockResolvedValueOnce(Response.json(refreshedTokens))
      .mockResolvedValueOnce(
        status === 401
          ? tokenExpiredResponse()
          : Response.json({ error: { message: 'Unavailable' } }, { status }),
      );
    await expect(
      callAI([{ role: 'user', content: 'Hello' }], runtime),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  },
);

it('does not replay output or refresh after onChunk has received content', async () => {
  const runtime = await prepareRejectedTokenTest(3);
  fetchMock.mockResolvedValueOnce(successfulStream());
  const onChunk = rs.fn(() => {
    throw Object.assign(new Error('Token expired after delivery'), {
      status: 401,
      code: 'token_expired',
    });
  });
  await expect(
    callAI([{ role: 'user', content: 'Hello' }], runtime, { onChunk }),
  ).rejects.toThrow('Token expired after delivery');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(onChunk).toHaveBeenCalledTimes(1);
});

it('shares forced refreshes and reuses a token already refreshed by another caller', async () => {
  await prepareRejectedTokenTest();
  fetchMock.mockResolvedValue(Response.json(refreshedTokens));
  expect(
    await Promise.all(
      Array.from({ length: 5 }, () =>
        siwcTokenManager.refreshAccessToken('old-access'),
      ),
    ),
  ).toEqual(Array(5).fill('new-access'));
  expect(await siwcTokenManager.refreshAccessToken('old-access')).toBe(
    'new-access',
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('stops if refreshing the rejected token fails', async () => {
  const runtime = await prepareRejectedTokenTest(3);
  fetchMock
    .mockResolvedValueOnce(tokenExpiredResponse())
    .mockResolvedValueOnce(new Response('invalid_grant', { status: 400 }));
  await expect(
    callAI([{ role: 'user', content: 'Hello' }], runtime),
  ).rejects.toThrow('siwc login');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
