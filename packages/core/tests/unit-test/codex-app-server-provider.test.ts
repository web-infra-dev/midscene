import {
  __shutdownCodexAppServerForTests,
  buildCodexTurnPayloadFromMessages,
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

describe('codex app-server provider helper', () => {
  afterEach(async () => {
    await __shutdownCodexAppServerForTests();
    rs.restoreAllMocks();
    rs.resetModules();
    rs.unmock('node:child_process');
    rs.unmock('node:readline');
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
    ).toBe('high');

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
    ).toBe('medium');

    expect(
      resolveCodexReasoningEffort({
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'minimal',
        },
      }),
    ).toBe('minimal');

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
        modelConfig: baseModelConfig,
      }),
    ).toBe('high');

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
    ).toBeUndefined();
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

  it('does not include image detail in codex turn inputs', () => {
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

  // The codex provider loads `node:child_process` and `node:readline` via
  // `await import(variable)` at runtime. Under Vitest, `rs.doMock` of those
  // Node built-ins intercepted that dynamic import so we could inject an
  // EventEmitter-based child process and verify spawn-error handling.
  //
  // Rstest 0.10.2 mocking (rs.mock / rs.doMock) relies on bundler-driven
  // import rewriting, which does NOT cover Node built-ins (they stay
  // external). `rs.spyOn(cp, 'spawn')` also fails with "Cannot redefine
  // property: spawn" because ESM bindings on `node:child_process` are
  // non-configurable. There is no rstest-native pattern at this version to
  // mock these modules from inside a test. Re-enable once rstest exposes an
  // equivalent (issue tracked in migration notes).
  it('surfaces codex spawn errors as regular model errors', async () => {
    // The SUT loads `node:child_process` and `node:readline` via
    // `await import(variableName)`. Rstest 0.10.2 cannot mock those built-ins:
    // - `rs.mock('node:child_process', ...)` only works on bundled module ids
    //   via webpack rewrites, but the dynamic specifier is unknown at bundle
    //   time so the call falls through to rstest's runtime
    //   `__rstest_dynamic_import__` which, for built-in specifiers, does a
    //   bare `await import('node:child_process')` and returns the live ESM
    //   namespace (see `0~loadEsModule.js` line 51, 65 in @rstest/core 0.10.2).
    // - `rs.spyOn(cp, 'spawn')` fails with `Cannot redefine property: spawn`
    //   because the ESM namespace's `spawn` binding is `configurable: false`.
    // - Pre-populating `Module._cache` (the trick used in
    //   `proxy-configuration.test.ts`) does not apply: Node never stores
    //   built-ins in `require.cache`, and once any module imports
    //   `node:child_process` via ESM (rstest itself does at startup) the
    //   namespace bindings are snapshotted and CJS mutation cannot propagate.
    //
    // Workaround: drive the real `child_process.spawn` into a failure by
    // pointing PATH at a directory with no `codex` binary. The SUT then
    // throws while writing to the unavailable stdin pipe, which is still a
    // spawn-induced error surfaced from `callAIWithCodexAppServer`.
    const originalPath = process.env.PATH;
    process.env.PATH = '/var/empty-nonexistent-dir-for-codex-test';
    try {
      const mod = await import('@/ai-model/service-caller/codex-app-server');
      await expect(
        mod.callAIWithCodexAppServer(
          [{ role: 'user', content: 'hello' }],
          baseModelConfig,
        ),
      ).rejects.toThrow(/codex app-server/);
    } finally {
      if (originalPath === undefined) {
        process.env.PATH = undefined;
      } else {
        process.env.PATH = originalPath;
      }
    }
  });
});
