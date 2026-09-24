import {
  chmod,
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import {
  __shutdownCodexAppServerForTests,
  buildCodexTurnPayloadFromMessages,
  callAIWithCodexAppServer,
  isCodexAppServerProvider,
  normalizeCodexLocalImagePath,
} from '@/ai-model/service-caller/codex/codex-app-server';
import {
  AIRequestTimeoutError,
  runWithAbortSignal,
} from '@/ai-model/service-caller/request-timeout';
import type {
  ConversationMessage,
  ModelCallMessages,
} from '@/ai-model/service-caller/types';
import type { CodeGenerationChunk } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const baseModelConfig: IModelConfig = {
  modelName: 'gpt-5.4',
  modelDescription: 'codex',
  intent: 'default',
  slot: 'default',
};

const temporaryDirectories: string[] = [];
const initialWorkingDirectory = process.cwd();

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'midscene-codex-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

const setupCodexServer = async (holdTurns = false) => {
  const executableDirectory = await createTemporaryDirectory();
  const serverPath = path.join(executableDirectory, 'codex-server.cjs');
  await writeFile(
    serverPath,
    `const { appendFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline').createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
readline.on('line', (line) => {
const message = JSON.parse(line);
if (message.method === 'initialize') {
  send({ id: message.id, result: {} });
} else if (message.method === 'thread/start') {
  appendFileSync(path.join(__dirname, 'requests.log'), 'thread/start\\n');
  send({ id: message.id, result: { thread: { id: 'thread-1' } } });
} else if (message.method === 'turn/start') {
  send({ id: message.id, result: { turn: { id: 'turn-1' } } });
  send({
    method: 'item/agentMessage/delta',
    params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'hello' },
  });
  send({
    method: 'thread/tokenUsage/updated',
    params: { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: {
      last: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 3, reasoningOutputTokens: 2 },
    } },
  });
  const complete = () => {
  if (${holdTurns} && !existsSync(path.join(__dirname, 'release'))) {
    setTimeout(complete, 10);
    return;
  }
  send({
    method: 'turn/completed',
    params: {
      threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'completed' },
    },
  });
  };
  complete();
} else if (message.method === 'thread/unsubscribe') {
  send({ id: message.id, result: {} });
}
});
`,
  );
  if (process.platform === 'win32') {
    // Node's spawn without `shell: true` can only execute real Windows
    // executables (no `.cmd`/`.bat` shims), so provide a `codex.exe` that
    // is a copy of the Node binary. It receives the production argument
    // `app-server` and resolves it as an entry script relative to the
    // working directory, so run the test from the fake-server directory.
    await copyFile(
      process.execPath,
      path.join(executableDirectory, 'codex.exe'),
    );
    await writeFile(
      path.join(executableDirectory, 'app-server.js'),
      "require('./codex-server.cjs');\n",
    );
    process.chdir(executableDirectory);
  } else {
    const executablePath = path.join(executableDirectory, 'codex');
    await writeFile(
      executablePath,
      "#!/usr/bin/env node\nrequire('./codex-server.cjs');\n",
    );
    await chmod(executablePath, 0o755);
  }
  rs.stubEnv(
    'PATH',
    `${executableDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
  );
  return {
    requestLog: path.join(executableDirectory, 'requests.log'),
    releaseFile: path.join(executableDirectory, 'release'),
  };
};

const resolveImageDetail = new ResolvedModelAdapter({}, 'test')
  .resolveImageDetail;

describe('codex app-server provider helper', () => {
  afterEach(async () => {
    await __shutdownCodexAppServerForTests();
    process.chdir(initialWorkingDirectory);
    rs.unstubAllEnvs();
    rs.restoreAllMocks();
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        // On Windows the killed codex.exe may still be mapped for a moment
        // after shutdown resolves; retry EPERM/EBUSY instead of racing it.
        rm(directory, { recursive: true, maxRetries: 10, retryDelay: 200 }),
      ),
    );
  });

  it('detects codex provider base url', () => {
    expect(isCodexAppServerProvider('codex://app-server')).toBe(true);
    expect(isCodexAppServerProvider('  CODEX://APP-SERVER  ')).toBe(true);
    expect(isCodexAppServerProvider('https://api.openai.com/v1')).toBe(false);
    expect(isCodexAppServerProvider(undefined)).toBe(false);
  });

  it('preserves default Codex parameter handling for other model families', () => {
    const adapter = new ResolvedModelAdapter({}, 'default');
    expect(adapter.buildCodexAppServerParams({}).config).toEqual({
      effort: 'none',
    });
    expect(
      adapter.buildCodexAppServerParams({
        userConfig: { reasoningEnabled: true },
      }).config,
    ).toEqual({ effort: 'medium' });
    expect(
      adapter.buildCodexAppServerParams({
        userConfig: { reasoningEnabled: true, reasoningEffort: ' XHIGH ' },
      }).config,
    ).toEqual({ effort: 'xhigh' });
    expect(
      adapter.buildCodexAppServerParams({
        userConfig: { reasoningEnabled: true, reasoningEffort: 'invalid' },
      }).config,
    ).toEqual({ effort: 'medium' });
  });

  it('converts conversation messages into codex turn payload', () => {
    const messages: ConversationMessage[] = [
      {
        role: 'system',
        content: 'System rule: return concise output.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Please inspect this screenshot.' },
          {
            type: 'image',
            url: 'https://example.com/image.png',
          },
          {
            type: 'image',
            url: 'file:///tmp/local-shot.png',
          },
        ],
      },
      {
        role: 'assistant',
        content: 'I will check it now.',
      },
    ];

    const payload = buildCodexTurnPayloadFromMessages(
      messages,
      resolveImageDetail,
    );

    expect(payload.developerInstructions).toContain(
      'System rule: return concise output.',
    );
    expect(payload.input[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('[USER]'),
    });
    expect((payload.input[0] as any).text).toContain(
      'Please inspect this screenshot.',
    );
    expect((payload.input[0] as any).text).toContain('[ASSISTANT]');
    expect(payload.input).toContainEqual({
      type: 'image',
      url: 'https://example.com/image.png',
      detail: 'high',
    });
    expect(payload.input).toContainEqual({
      type: 'localImage',
      path: '/tmp/local-shot.png',
      detail: 'high',
    });
  });

  it('converts history entries directly and applies image detail without mutating history', () => {
    const messages: ModelCallMessages = [
      {
        type: 'input-message',
        message: { role: 'system', content: 'System rule' },
      },
      {
        type: 'input-message',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Inspect screenshot' },
            {
              type: 'image',
              url: 'https://example.com/image.png',
            },
          ],
        },
      },
      {
        type: 'model-output',
        output: {
          type: 'chat-completion',
          rawValue: {
            role: 'assistant',
            content: 'Previous answer',
            refusal: null,
          },
        },
      },
    ];
    const original = structuredClone(messages);
    const payload = buildCodexTurnPayloadFromMessages(
      messages,
      () => 'original',
    );
    expect(payload.developerInstructions).toBe('System rule');
    expect(payload.input[0]).toMatchObject({
      type: 'text',
      text: '[USER]\nInspect screenshot\n\n[ASSISTANT]\nPrevious answer',
    });
    expect(payload.input).toContainEqual({
      type: 'image',
      url: 'https://example.com/image.png',
      detail: 'original',
    });
    expect(messages).toEqual(original);
  });

  it('rejects Responses output in Codex history', () => {
    expect(() =>
      buildCodexTurnPayloadFromMessages(
        [{ type: 'model-output', output: { type: 'responses', rawValue: [] } }],
        resolveImageDetail,
      ),
    ).toThrow('Cannot replay Responses output in a Codex conversation');
  });

  it('preserves image detail in codex turn inputs', () => {
    const messages: ConversationMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this.' },
          {
            type: 'image',
            url: 'https://example.com/img.png',
          },
        ],
      },
    ];

    const payload = buildCodexTurnPayloadFromMessages(
      messages,
      resolveImageDetail,
    );

    expect(payload.input).toContainEqual({
      type: 'image',
      url: 'https://example.com/img.png',
      detail: 'high',
    });
  });

  it('overrides image detail in codex turn inputs when required by adapter', () => {
    const messages: ConversationMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            url: 'file:///tmp/local-shot.png',
          },
        ],
      },
    ];

    const payload = buildCodexTurnPayloadFromMessages(
      messages,
      () => 'original',
    );
    expect(messages[0].content[0]).not.toHaveProperty('detail');

    expect(payload.input).toContainEqual({
      type: 'localImage',
      path: '/tmp/local-shot.png',
      detail: 'original',
    });
  });

  it('keeps the newest transcript context when truncating long turns', () => {
    const oldContent = `old-prefix-${'a'.repeat(270_000)}`;
    const latestRequest = 'latest user request should survive truncation';
    const payload = buildCodexTurnPayloadFromMessages(
      [
        {
          role: 'user',
          content: oldContent,
        },
        {
          role: 'assistant',
          content: 'intermediate assistant response',
        },
        {
          role: 'user',
          content: latestRequest,
        },
      ],
      resolveImageDetail,
    );

    expect(payload.input[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining(latestRequest),
    });
    expect((payload.input[0] as any).text).not.toContain('old-prefix-');
    expect((payload.input[0] as any).text.length).toBeLessThanOrEqual(
      256 * 1024,
    );
  });

  it('normalizes file urls into platform-safe local image paths', () => {
    expect(normalizeCodexLocalImagePath('file:///tmp/local-shot.png')).toBe(
      '/tmp/local-shot.png',
    );
    expect(
      normalizeCodexLocalImagePath('file:///C:/tmp/local-shot.png', 'win32'),
    ).toBe('C:\\tmp\\local-shot.png');
    expect(
      normalizeCodexLocalImagePath(
        'file://server/share/local-shot.png',
        'win32',
      ),
    ).toBe('\\\\server\\share\\local-shot.png');
  });

  it('surfaces codex spawn errors as regular model errors', async () => {
    rs.stubEnv('PATH', await createTemporaryDirectory());

    await expect(
      callAIWithCodexAppServer(
        [{ role: 'user', content: 'hello' }],
        baseModelConfig,
        { resolveImageDetail },
      ),
    ).rejects.toThrow(
      /(?:codex app-server process error: spawn codex ENOENT|failed writing to codex app-server stdin: write EPIPE)/,
    );
  });

  it.each([
    ['timeout', new AIRequestTimeoutError(10)],
    ['user cancellation', new Error('user cancelled')],
  ])('skips a queued turn after %s', async (_label, reason) => {
    await setupCodexServer();
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'hello' },
    ];
    const first = callAIWithCodexAppServer(messages, baseModelConfig, {
      resolveImageDetail,
    });
    const controller = new AbortController();
    const queuedEvents = rs.fn();
    const queued = runWithAbortSignal(controller.signal, () =>
      callAIWithCodexAppServer(messages, baseModelConfig, {
        resolveImageDetail,
        abortSignal: controller.signal,
        onRecordEvent: queuedEvents,
      }),
    );

    controller.abort(reason);
    await expect(queued).rejects.toBe(reason);
    await first;

    // A following turn ensures the expired queue entry has been processed.
    const following = await callAIWithCodexAppServer(
      messages,
      baseModelConfig,
      { resolveImageDetail },
    );
    expect(following.content).toBe('hello');
    expect(queuedEvents).not.toHaveBeenCalled();
  });

  it('counts queue waiting against each callAI attempt timeout without sending expired turns', async () => {
    const { requestLog, releaseFile } = await setupCodexServer(true);
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'hello' },
    ];
    const config = {
      ...baseModelConfig,
      openaiBaseURL: 'codex://app-server',
      retryInterval: 0,
    };
    const onChunk = rs.fn();
    const first = callAI(
      messages,
      getModelRuntime({ ...config, timeout: 0, retryCount: 0 }),
      { stream: true, onChunk },
    );
    try {
      await rs.waitFor(() => expect(onChunk).toHaveBeenCalled(), {
        timeout: 5000,
      });

      // TODO: Consider removing serialization or increasing concurrency in the
      // Codex connection manager. Until then, queue waiting consumes each
      // attempt's timeout, including attempts that never start a server turn.
      await expect(
        callAI(
          messages,
          getModelRuntime({ ...config, timeout: 50, retryCount: 1 }),
        ),
      ).rejects.toThrow(/1 retry \(2\/2 attempts\).*hard timeout/);
      expect(await readFile(requestLog, 'utf8')).toBe('thread/start\n');
    } finally {
      await writeFile(releaseFile, '');
      await first;
    }

    // Drain both expired attempts before checking that neither was sent later.
    const following = await callAI(
      messages,
      getModelRuntime({ ...config, timeout: 5000, retryCount: 0 }),
    );
    expect(following.content).toBe('hello');
    expect(await readFile(requestLog, 'utf8')).toBe(
      'thread/start\nthread/start\n',
    );
  });

  it.each([0, 25])(
    'does not create a turn deadline from timeout %s',
    async (timeout) => {
      await setupCodexServer();
      const now = Date.now();
      const clock = rs.spyOn(Date, 'now').mockReturnValue(now);
      const controller = new AbortController();
      const result = await callAIWithCodexAppServer(
        [{ role: 'user', content: 'hello' }],
        { ...baseModelConfig, timeout },
        {
          resolveImageDetail,
          abortSignal: controller.signal,
          onRecordEvent: (event) => {
            if (
              event.type === 'request' &&
              event.protocol.method === 'turn/start'
            ) {
              // Passing ten minutes must not add a provider-owned model deadline.
              clock.mockReturnValue(now + 600_001);
            }
          },
        },
      );
      expect(result.content).toBe('hello');
      expect(controller.signal.aborted).toBe(false);
    },
  );

  it('reports Codex JSON-RPC requests, responses, and turn notifications', async () => {
    await setupCodexServer();

    const events: unknown[] = [];
    const result = await callAIWithCodexAppServer(
      [{ role: 'user', content: 'hello' }],
      baseModelConfig,
      {
        resolveImageDetail,
        params: { effort: 'max' },
        onRecordEvent: (event) => events.push(event),
      },
    );

    const expectedUsage = {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 3 },
      completion_tokens_details: { reasoning_tokens: 2 },
    };
    expect(result.usage).toEqual(expectedUsage);
    const runtime = getModelRuntime({
      ...baseModelConfig,
      openaiBaseURL: 'codex://app-server',
    });
    const onUsage = rs.fn();
    runtime.onUsage = onUsage;
    const chunks: CodeGenerationChunk[] = [];
    const enriched = await callAI(
      [{ role: 'user', content: 'hello' }],
      runtime,
      { stream: true, onChunk: (chunk) => chunks.push(chunk) },
    );
    expect(chunks.at(-1)?.usage).toEqual(expectedUsage);
    expect(enriched.usage).toMatchObject({
      api_type: 'codex',
      ...expectedUsage,
      cached_input: 3,
      model_name: baseModelConfig.modelName,
      model_description: 'codex',
      slot: 'default',
      request_id: 'turn-1',
      _midscene_call_id: expect.any(String),
      time_cost: expect.any(Number),
    });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith(enriched.usage);

    expect(result).toMatchObject({
      content: 'hello',
      protocolMetadata: {
        transport: 'json-rpc',
        threadId: 'thread-1',
        turnId: 'turn-1',
        turnStatus: 'completed',
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request',
          protocol: expect.objectContaining({ method: 'thread/start' }),
        }),
        expect.objectContaining({
          type: 'request',
          protocol: expect.objectContaining({
            method: 'turn/start',
            params: expect.objectContaining({ effort: 'max' }),
          }),
        }),
        expect.objectContaining({
          type: 'chunk',
          protocol: expect.objectContaining({
            direction: 'server',
            method: 'thread/start',
            result: { thread: { id: 'thread-1' } },
          }),
        }),
        expect.objectContaining({
          type: 'chunk',
          protocol: expect.objectContaining({
            direction: 'server',
            method: 'turn/start',
            result: { turn: { id: 'turn-1' } },
          }),
        }),
        expect.objectContaining({
          type: 'chunk',
          protocol: expect.objectContaining({
            method: 'item/agentMessage/delta',
          }),
        }),
        expect.objectContaining({
          type: 'chunk',
          protocol: expect.objectContaining({ method: 'turn/completed' }),
        }),
      ]),
    );

    await __shutdownCodexAppServerForTests();
  });
});
