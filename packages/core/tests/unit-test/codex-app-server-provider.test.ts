import { EventEmitter } from 'node:events';
import {
  __shutdownCodexAppServerForTests,
  buildCodexTurnPayloadFromMessages,
  isCodexAppServerProvider,
  normalizeCodexLocalImagePath,
  resolveCodexReasoningEffort,
} from '@/ai-model/service-caller/codex-app-server';
import type { IModelConfig } from '@midscene/shared/env';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { afterEach, describe, expect, it, vi } from 'vitest';

const baseModelConfig: IModelConfig = {
  modelName: 'gpt-5.4',
  modelDescription: 'codex',
  intent: 'default',
};

describe('codex app-server provider helper', () => {
  afterEach(async () => {
    await __shutdownCodexAppServerForTests();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock('node:child_process');
    vi.unmock('node:readline');
  });

  it('detects codex provider base url', () => {
    expect(isCodexAppServerProvider('codex://app-server')).toBe(true);
    expect(isCodexAppServerProvider('  CODEX://APP-SERVER  ')).toBe(true);
    expect(isCodexAppServerProvider('https://api.openai.com/v1')).toBe(false);
    expect(isCodexAppServerProvider(undefined)).toBe(false);
  });

  it('maps deepThink and reasoning effort to codex effort', () => {
    expect(
      resolveCodexReasoningEffort({
        deepThink: true,
        modelConfig: baseModelConfig,
      }),
    ).toBe('high');

    expect(
      resolveCodexReasoningEffort({
        deepThink: false,
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'xhigh',
        },
      }),
    ).toBe('low');

    expect(
      resolveCodexReasoningEffort({
        deepThink: 'unset',
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'medium',
        },
      }),
    ).toBe('medium');

    expect(
      resolveCodexReasoningEffort({
        deepThink: 'unset',
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'invalid-effort',
        },
      }),
    ).toBeUndefined();

    expect(
      resolveCodexReasoningEffort({
        deepThink: 'unset',
        modelConfig: {
          ...baseModelConfig,
          reasoningEnabled: true,
        },
      }),
    ).toBe('high');

    expect(
      resolveCodexReasoningEffort({
        deepThink: 'unset',
        modelConfig: {
          ...baseModelConfig,
          reasoningEnabled: false,
        },
      }),
    ).toBe('low');

    expect(
      resolveCodexReasoningEffort({
        deepThink: 'unset',
        modelConfig: {
          ...baseModelConfig,
          reasoningEnabled: false,
          reasoningEffort: 'medium',
        },
      }),
    ).toBe('medium');
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
    vi.resetModules();

    const lineReader = new EventEmitter() as EventEmitter & {
      close: ReturnType<typeof vi.fn>;
      on: EventEmitter['on'];
    };
    lineReader.close = vi.fn();

    const stdout = new EventEmitter() as EventEmitter & {
      unref: ReturnType<typeof vi.fn>;
    };
    stdout.unref = vi.fn();

    const stderr = new EventEmitter() as EventEmitter & {
      unref: ReturnType<typeof vi.fn>;
    };
    stderr.unref = vi.fn();

    const stdin = {
      end: vi.fn(),
      unref: vi.fn(),
      write: vi.fn(
        (
          _line: string,
          callback?: (error?: Error | null | undefined) => void,
        ) => {
          callback?.(null);
          return true;
        },
      ),
    };

    const child = new EventEmitter() as EventEmitter & {
      stdin: typeof stdin;
      stdout: typeof stdout;
      stderr: typeof stderr;
      kill: ReturnType<typeof vi.fn>;
      unref: ReturnType<typeof vi.fn>;
    };
    child.stdin = stdin;
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = vi.fn();
    child.unref = vi.fn();

    vi.doMock('node:child_process', () => ({
      spawn: vi.fn(() => {
        queueMicrotask(() => {
          child.emit('error', new Error('spawn ENOENT'));
        });
        return child;
      }),
    }));

    vi.doMock('node:readline', () => ({
      createInterface: vi.fn(() => lineReader),
    }));

    const mockedModule = await import(
      '@/ai-model/service-caller/codex-app-server'
    );

    await expect(
      mockedModule.callAIWithCodexAppServer(
        [{ role: 'user', content: 'hello' }],
        baseModelConfig,
      ),
    ).rejects.toThrow(/codex app-server process error: spawn ENOENT/);
  });
});
