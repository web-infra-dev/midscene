import {
  generateCommonTools,
  generateToolsFromActionSpace,
} from '@/mcp/tool-generator';
import { composeUserPrompt } from '@/mcp/user-prompt';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const multimodalPromptSchema = z.object({
  prompt: z.string(),
  images: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
  convertHttpImage2Base64: z.boolean().optional(),
});

const locateSchema = z
  .object({
    prompt: z.union([z.string(), multimodalPromptSchema]),
    deepLocate: z.boolean().optional(),
    cacheable: z.boolean().optional(),
    xpath: z.union([z.string(), z.boolean()]).optional(),
  })
  .passthrough();

const actionSpace = [
  {
    name: 'Tap',
    description: 'Tap the element',
    paramSchema: z.object({
      locate: locateSchema,
    }),
  },
];

const screenshotBase64 = 'data:image/png;base64,Zm9v';

describe('generateToolsFromActionSpace', () => {
  it('passes structured locate extras through callActionInActionSpace and keeps locate options at top level', async () => {
    const callActionInActionSpace = vi.fn().mockResolvedValue(undefined);
    const page = {
      screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
    };
    const [tool] = generateToolsFromActionSpace(actionSpace, async () => ({
      callActionInActionSpace,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page,
    }));

    const images = [
      {
        name: 'reference logo',
        url: 'https://example.com/logo.png',
      },
    ];

    const result = await tool.handler({
      locate: {
        prompt: 'the reference logo',
        deepLocate: true,
        images,
        convertHttpImage2Base64: true,
      },
    });

    expect(callActionInActionSpace).toHaveBeenCalledWith('Tap', {
      locate: {
        prompt: {
          prompt: 'the reference logo',
          images,
          convertHttpImage2Base64: true,
        },
        deepLocate: true,
      },
    });
    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Action "Tap" completed.' },
        { type: 'image', data: 'Zm9v', mimeType: 'image/png' },
      ],
    });
  });

  it('normalizes string locate shorthand before direct action execution', async () => {
    const callActionInActionSpace = vi.fn().mockResolvedValue(undefined);
    const [tool] = generateToolsFromActionSpace(actionSpace, async () => ({
      callActionInActionSpace,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: {
        screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
      },
    }));

    await tool.handler({
      locate: 'the login button',
    });

    expect(callActionInActionSpace).toHaveBeenCalledWith('Tap', {
      locate: {
        prompt: 'the login button',
      },
    });
  });

  it('falls back to aiAction when direct action execution is unavailable', async () => {
    const aiAction = vi.fn().mockResolvedValue(undefined);
    const [tool] = generateToolsFromActionSpace(actionSpace, async () => ({
      aiAction,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: {
        screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
      },
    }));

    await tool.handler({
      locate: {
        prompt: {
          prompt: 'the login button',
        },
      },
    });

    expect(aiAction).toHaveBeenCalledWith('Tap on "the login button"');
  });

  it('includes direct action return values in the tool result', async () => {
    const callActionInActionSpace = vi
      .fn()
      .mockResolvedValue('pm clear output');
    const [tool] = generateToolsFromActionSpace(
      [
        {
          name: 'RunAdbShell',
          description: 'Execute ADB shell command',
          paramSchema: z.object({
            command: z.string(),
          }),
        },
      ],
      async () => ({
        callActionInActionSpace,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: {
          screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
        },
      }),
    );

    const result = await tool.handler({
      command: 'pm clear com.example.app',
    });

    expect(callActionInActionSpace).toHaveBeenCalledWith('RunAdbShell', {
      command: 'pm clear com.example.app',
    });
    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Action "RunAdbShell" completed.' },
        { type: 'text', text: 'Result: pm clear output' },
        { type: 'image', data: 'Zm9v', mimeType: 'image/png' },
      ],
    });
  });

  it('passes raw args to the agent getter while stripping init args from action payload', async () => {
    const callActionInActionSpace = vi
      .fn()
      .mockResolvedValue('pm clear output');
    const getAgent = vi.fn().mockResolvedValue({
      callActionInActionSpace,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: {
        screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
      },
    });
    const [tool] = generateToolsFromActionSpace(
      [
        {
          name: 'RunAdbShell',
          description: 'Execute ADB shell command',
          paramSchema: z.object({
            command: z.string(),
          }),
        },
      ],
      getAgent,
      ({ deviceId: _deviceId, ...rest }) => rest,
    );

    await tool.handler({
      command: 'pm clear com.example.app',
      deviceId: 'target-device',
    });

    expect(getAgent).toHaveBeenCalledWith({
      command: 'pm clear com.example.app',
      deviceId: 'target-device',
    });
    expect(callActionInActionSpace).toHaveBeenCalledWith('RunAdbShell', {
      command: 'pm clear com.example.app',
    });
  });

  it('merges init arg schema into action and common tools', () => {
    const initArgSchema = {
      'android.deviceId': z.string().optional().describe('Android device ID'),
    };
    const initArgCliMetadata = {
      options: {
        'android.deviceId': {
          preferredName: 'device-id',
          aliases: ['deviceId'],
        },
      },
    };
    const [actionTool] = generateToolsFromActionSpace(
      actionSpace,
      async () => ({
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: {
          screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
        },
      }),
      undefined,
      initArgSchema,
      initArgCliMetadata,
    );
    const commonTools = generateCommonTools(
      async () => ({
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: {
          screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
        },
      }),
      initArgSchema,
      initArgCliMetadata,
    );

    expect(actionTool.schema).toHaveProperty('locate');
    expect(actionTool.schema).toHaveProperty('android.deviceId');
    expect(actionTool.cli).toEqual(initArgCliMetadata);
    expect(
      commonTools.find((tool) => tool.name === 'take_screenshot')?.schema,
    ).toHaveProperty('android.deviceId');
    expect(
      commonTools.find((tool) => tool.name === 'take_screenshot')?.cli,
    ).toEqual(initArgCliMetadata);
    expect(commonTools.find((tool) => tool.name === 'act')?.schema).toEqual(
      expect.objectContaining({
        prompt: expect.anything(),
        'android.deviceId': expect.anything(),
      }),
    );
    expect(commonTools.find((tool) => tool.name === 'act')?.cli).toEqual(
      initArgCliMetadata,
    );

    expect(commonTools.find((tool) => tool.name === 'assert')?.schema).toEqual(
      expect.objectContaining({
        prompt: expect.anything(),
        'android.deviceId': expect.anything(),
      }),
    );
    expect(commonTools.find((tool) => tool.name === 'assert')?.cli).toEqual(
      initArgCliMetadata,
    );
  });

  // Guardrail for https://github.com/web-infra-dev/midscene/issues/2313:
  // A primitive Zod paramSchema (e.g. z.string()) used to silently fall
  // through extractActionSchema and leak the Zod instance's prototype
  // methods (parse / safeParse / _def) as CLI flags. Reject such schemas
  // loudly at tool-definition time so platform-specific actions stay
  // aligned across iOS / Android / Harmony.
  it('rejects non-object paramSchema with a clear error naming the action', () => {
    const badActionSpace = [
      {
        name: 'BadLaunch',
        description: 'Launch something',
        paramSchema: z.string(),
      },
    ];

    expect(() =>
      generateToolsFromActionSpace(
        badActionSpace as any,
        async () => ({}) as any,
      ),
    ).toThrow(/Action "BadLaunch" declared a non-object paramSchema/);
  });

  it('accepts undefined paramSchema and ZodObject paramSchema', () => {
    const okActionSpace = [
      {
        name: 'NoParamAction',
        description: 'takes no args',
        paramSchema: undefined,
      },
      {
        name: 'ObjectAction',
        description: 'takes object args',
        paramSchema: z.object({ uri: z.string() }),
      },
    ];

    expect(() =>
      generateToolsFromActionSpace(
        okActionSpace as any,
        async () => ({}) as any,
      ),
    ).not.toThrow();
  });
});

describe('composeUserPrompt', () => {
  it('returns the bare string when no images are supplied', () => {
    expect(composeUserPrompt({ prompt: 'just text' })).toBe('just text');
  });

  it('accepts an images JSON array string', () => {
    const result = composeUserPrompt({
      prompt: 'compare to the logo',
      images: '[{"name":"logo","url":"https://x/y.png"}]',
    });
    expect(result).toEqual({
      prompt: 'compare to the logo',
      images: [{ name: 'logo', url: 'https://x/y.png' }],
    });
  });

  it('accepts a native images array with convertHttpImage2Base64', () => {
    const result = composeUserPrompt({
      prompt: 'p',
      images: [{ name: 'a', url: 'https://x/a.png' }],
      convertHttpImage2Base64: true,
    });
    expect(result).toEqual({
      prompt: 'p',
      images: [{ name: 'a', url: 'https://x/a.png' }],
      convertHttpImage2Base64: true,
    });
  });

  it('passes a local file path through verbatim (core resolves it)', () => {
    // SDK contract: each image url may be http(s), data: URI, or a local path.
    // The CLI does not pre-resolve local files; @midscene/core does that via
    // preProcessImageUrl during the actual model call.
    const result = composeUserPrompt({
      prompt: 'find the red marker',
      images: '[{"name":"marker","url":"./fixtures/red.png"}]',
    });

    expect(result).toEqual({
      prompt: 'find the red marker',
      images: [{ name: 'marker', url: './fixtures/red.png' }],
    });
  });

  it('coerces stringified booleans for convertHttpImage2Base64', () => {
    const result = composeUserPrompt({
      prompt: 'p',
      images: [{ name: 'a', url: 'https://x/a.png' }],
      convertHttpImage2Base64: 'true',
    });
    expect(result).toMatchObject({ convertHttpImage2Base64: true });
  });

  it('throws when convertHttpImage2Base64 is an unrecognized string', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        images: [{ name: 'a', url: 'https://x/a.png' }],
        convertHttpImage2Base64: 'maybe',
      }),
    ).toThrow(/convertHttpImage2Base64/);
  });

  it('throws when images is a non-JSON string', () => {
    expect(() =>
      composeUserPrompt({ prompt: 'p', images: 'not-json' }),
    ).toThrow(/images:/);
  });

  it('throws when an images array entry is missing name or url', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        images: '[{"name":"x"}]',
      }),
    ).toThrow(/images\[0\]/);
  });

  it('throws when an images array entry contains a non-reference item', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        images: [{ name: 'a', url: 'https://x/a.png' }, 'junk'],
      }),
    ).toThrow(/images\[1\]/);
  });

  it('strips unknown fields from image entries before forwarding', () => {
    const result = composeUserPrompt({
      prompt: 'p',
      images: [
        {
          name: 'a',
          url: 'https://x/a.png',
          secret: 'should-not-propagate',
        } as unknown as { name: string; url: string },
      ],
    });
    expect(result).toEqual({
      prompt: 'p',
      images: [{ name: 'a', url: 'https://x/a.png' }],
    });
  });

  it('throws when images JSON is not an array', () => {
    expect(() =>
      composeUserPrompt({ prompt: 'p', images: '{"name":"x","url":"y"}' }),
    ).toThrow(/non-array JSON/);
  });

  it('throws when images is neither a string nor an array', () => {
    expect(() =>
      composeUserPrompt({ prompt: 'p', images: 42 as unknown as string }),
    ).toThrow(/got number/);
  });
});

describe('generateCommonTools — assert image prompts', () => {
  const screenshotBase64 = 'data:image/png;base64,Zm9v';

  it('passes prompt through unchanged when no images are supplied', async () => {
    const aiAssert = vi.fn().mockResolvedValue(undefined);
    const tools = generateCommonTools(async () => ({
      aiAssert,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const assert = tools.find((t) => t.name === 'assert')!;
    await assert.handler({ prompt: 'login button visible' });

    expect(aiAssert).toHaveBeenCalledWith('login button visible');
  });

  it('forwards images to aiAssert as a TUserPrompt-style object', async () => {
    const aiAssert = vi.fn().mockResolvedValue(undefined);
    const tools = generateCommonTools(async () => ({
      aiAssert,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const assert = tools.find((t) => t.name === 'assert')!;
    await assert.handler({
      prompt: 'the visible badge matches the reference image',
      images: '[{"name":"target","url":"https://example.com/btn.png"}]',
    });

    expect(aiAssert).toHaveBeenCalledWith({
      prompt: 'the visible badge matches the reference image',
      images: [{ name: 'target', url: 'https://example.com/btn.png' }],
    });
  });

  it('forwards a local-path url verbatim so core can resolve it', async () => {
    const aiAssert = vi.fn().mockResolvedValue(undefined);
    const tools = generateCommonTools(async () => ({
      aiAssert,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const assert = tools.find((t) => t.name === 'assert')!;
    await assert.handler({
      prompt: 'the visible badge matches the supplied image',
      images: '[{"name":"badge","url":"./fixtures/badge.png"}]',
    });

    expect(aiAssert).toHaveBeenCalledWith({
      prompt: 'the visible badge matches the supplied image',
      images: [{ name: 'badge', url: './fixtures/badge.png' }],
    });
  });

  it('exposes images and convertHttpImage2Base64 on the assert schema (no imageFiles flag)', () => {
    const tools = generateCommonTools(async () => ({
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const assertSchema = tools.find((t) => t.name === 'assert')!.schema;
    expect(assertSchema).toHaveProperty('prompt');
    expect(assertSchema).toHaveProperty('images');
    expect(assertSchema).toHaveProperty('convertHttpImage2Base64');
    expect(assertSchema).not.toHaveProperty('imageFiles');

    // act schema stays string-only because the underlying core aiAct
    // does not yet parse multimodal prompts.
    const actSchema = tools.find((t) => t.name === 'act')!.schema;
    expect(actSchema).toHaveProperty('prompt');
    expect(actSchema).not.toHaveProperty('images');
    expect(actSchema).not.toHaveProperty('imageFiles');
  });
});
