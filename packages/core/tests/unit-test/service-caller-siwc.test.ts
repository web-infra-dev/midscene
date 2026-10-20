import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os' with { rstest: 'importActual' };
import { join } from 'node:path';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import { readSiwcAccessToken } from '@/ai-model/service-caller/openai/siwc';
import { ModelConfigManager } from '@midscene/shared/env';
import { afterEach, beforeEach, expect, it, rs } from '@rstest/core';

const directories: string[] = [];
const fetchMock = rs.fn<typeof fetch>();
const saveToken = async (token: unknown) => {
  await writeFile(
    join(os.homedir(), '.midscene', 'siwc.json'),
    JSON.stringify({ credentials: { access_token: token, expires_at: 0 } }),
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

it('reads the current token without checking expiry or caching credentials', async () => {
  await saveToken('first');
  expect(await readSiwcAccessToken()).toBe('first');
  await saveToken('second');
  expect(await readSiwcAccessToken()).toBe('second');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('reports missing, malformed and incomplete credentials without logging in', async () => {
  await expect(readSiwcAccessToken()).rejects.toThrow('siwc login');
  await writeFile(join(os.homedir(), '.midscene', 'siwc.json'), '{broken');
  await expect(readSiwcAccessToken()).rejects.toThrow('Invalid JSON');
  await saveToken('');
  await expect(readSiwcAccessToken()).rejects.toThrow('Missing access token');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('uses saved credentials and streaming Responses despite conflicting settings', async () => {
  await saveToken('saved-token');
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
});

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
  expect(await readSiwcAccessToken()).toBe('expired-token');
});
