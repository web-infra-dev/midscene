import { chmod, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  __shutdownCodexAppServerForTests,
  buildCodexTurnPayloadFromMessages,
  callAIWithCodexAppServer,
  isCodexAppServerProvider,
  normalizeCodexLocalImagePath,
  resolveCodexReasoningEffort,
} from '@/ai-model/service-caller/codex-app-server';
import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import type { ChatCompletionMessageParam } from 'openai/resources/index';

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

describe('codex app-server provider helper', () => {
  afterEach(async () => {
    await __shutdownCodexAppServerForTests();
    process.chdir(initialWorkingDirectory);
    rs.unstubAllEnvs();
    rs.restoreAllMocks();
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true })),
    );
  });

  it('detects codex provider base url', () => {
    expect(isCodexAppServerProvider('codex://app-server')).toBe(true);
    expect(isCodexAppServerProvider('  CODEX://APP-SERVER  ')).toBe(true);
    expect(isCodexAppServerProvider('https://api.openai.com/v1')).toBe(false);
    expect(isCodexAppServerProvider(undefined)).toBe(false);
  });

  it('maps reasoningEnabled and reasoning effort to codex effort', () => {
    expect(
      resolveCodexReasoningEffort({
        reasoningEnabled: true,
        modelConfig: baseModelConfig,
      }),
    ).toBe('medium');

    expect(
      resolveCodexReasoningEffort({
        reasoningEnabled: false,
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'xhigh',
        },
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'medium',
        },
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'minimal',
        },
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'none',
        },
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'invalid-effort',
        },
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        modelConfig: baseModelConfig,
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        reasoningEnabled: true,
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'xhigh',
        },
      }),
    ).toBe('xhigh');

    expect(
      resolveCodexReasoningEffort({
        reasoningEnabled: false,
        modelConfig: baseModelConfig,
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        reasoningEnabled: false,
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'medium',
        },
      }),
    ).toBe('none');

    expect(
      resolveCodexReasoningEffort({
        reasoningEnabled: 'default',
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'medium',
        },
      }),
    ).toBe('none');
  });

  it('converts chat messages into codex turn payload', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'System rule: return concise output.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Please inspect this screenshot.' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.png' },
          },
          {
            type: 'image_url',
            image_url: { url: 'file:///tmp/local-shot.png' },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'I will check it now.',
      },
    ];

    const payload = buildCodexTurnPayloadFromMessages(messages);

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
    });
    expect(payload.input).toContainEqual({
      type: 'localImage',
      path: '/tmp/local-shot.png',
    });
  });

  it('preserves image detail in codex turn inputs', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this.' },
          {
            type: 'image_url',
            image_url: {
              url: 'https://example.com/img.png',
              detail: 'high',
            },
          },
        ],
      },
    ];

    const payload = buildCodexTurnPayloadFromMessages(messages);

    expect(payload.input).toContainEqual({
      type: 'image',
      url: 'https://example.com/img.png',
      detail: 'high',
    });
  });

  it('overrides image detail in codex turn inputs when required by adapter', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'file:///tmp/local-shot.png',
              detail: 'high',
            },
          },
        ],
      },
    ];

    const payload = buildCodexTurnPayloadFromMessages(messages, 'original');

    expect(payload.input).toContainEqual({
      type: 'localImage',
      path: '/tmp/local-shot.png',
      detail: 'original',
    });
  });

  it('keeps the newest transcript context when truncating long turns', () => {
    const oldContent = `old-prefix-${'a'.repeat(270_000)}`;
    const latestRequest = 'latest user request should survive truncation';
    const payload = buildCodexTurnPayloadFromMessages([
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
    ]);

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
      ),
    ).rejects.toThrow(
      /(?:codex app-server process error: spawn codex ENOENT|failed writing to codex app-server stdin: write EPIPE)/,
    );
  });

  it('reports Codex JSON-RPC requests, responses, and turn notifications', async () => {
    const executableDirectory = await createTemporaryDirectory();
    const serverPath = path.join(executableDirectory, 'codex-server.cjs');
    await writeFile(
      serverPath,
      `const readline = require('node:readline').createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
readline.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ id: message.id, result: {} });
  } else if (message.method === 'thread/start') {
    send({ id: message.id, result: { thread: { id: 'thread-1' } } });
  } else if (message.method === 'turn/start') {
    send({ id: message.id, result: { turn: { id: 'turn-1' } } });
    send({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'hello' },
    });
    send({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed' },
      },
    });
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

    const events: unknown[] = [];
    const result = await callAIWithCodexAppServer(
      [{ role: 'user', content: 'hello' }],
      baseModelConfig,
      { onRecordEvent: (event) => events.push(event) },
    );

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
          protocol: expect.objectContaining({ method: 'turn/start' }),
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
