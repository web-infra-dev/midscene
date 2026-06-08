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
    deepThink: z.boolean().optional(),
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

  it('includes aiAction return values in the common act tool result', async () => {
    const aiAction = vi.fn().mockResolvedValue('Midscene');
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: {
        screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
      },
    }));
    const actTool = commonTools.find((tool) => tool.name === 'act');

    const result = await actTool?.handler({
      prompt: 'return the first Google result heading for Midscene',
    });

    expect(aiAction).toHaveBeenCalledWith(
      'return the first Google result heading for Midscene',
      {
        deepThink: false,
      },
    );
    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Action "act" completed.' },
        { type: 'text', text: 'Result: Midscene' },
        { type: 'image', data: 'Zm9v', mimeType: 'image/png' },
      ],
    });
  });

  it('records take_screenshot in reports with the captured screenshot', async () => {
    const screenshotBase64Fn = vi.fn().mockResolvedValue(screenshotBase64);
    const recordToReport = vi.fn().mockResolvedValue(undefined);
    const commonTools = generateCommonTools(async () => ({
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: {
        screenshotBase64: screenshotBase64Fn,
      },
      recordToReport,
    }));
    const takeScreenshotTool = commonTools.find(
      (tool) => tool.name === 'take_screenshot',
    );

    const result = await takeScreenshotTool?.handler({});

    expect(screenshotBase64Fn).toHaveBeenCalledTimes(1);
    expect(recordToReport).toHaveBeenCalledWith('take_screenshot', {
      screenshotBase64,
    });
    expect(result).toEqual({
      content: [{ type: 'image', data: 'Zm9v', mimeType: 'image/png' }],
    });
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

  it('accepts paired image and imageName values', () => {
    const result = composeUserPrompt({
      prompt: 'compare to the logo',
      image: 'https://x/y.png',
      imageName: 'logo',
    });
    expect(result).toEqual({
      prompt: 'compare to the logo',
      images: [{ name: 'logo', url: 'https://x/y.png' }],
    });
  });

  it('accepts paired image arguments with convertHttpImage2Base64', () => {
    const result = composeUserPrompt({
      prompt: 'p',
      image: 'https://x/a.png',
      imageName: 'a',
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
      image: './fixtures/red.png',
      imageName: 'marker',
    });

    expect(result).toEqual({
      prompt: 'find the red marker',
      images: [{ name: 'marker', url: './fixtures/red.png' }],
    });
  });

  it('coerces stringified booleans for convertHttpImage2Base64', () => {
    const result = composeUserPrompt({
      prompt: 'p',
      image: 'https://x/a.png',
      imageName: 'a',
      convertHttpImage2Base64: 'true',
    });
    expect(result).toMatchObject({ convertHttpImage2Base64: true });
  });

  it('throws when convertHttpImage2Base64 is an unrecognized string', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        image: 'https://x/a.png',
        imageName: 'a',
        convertHttpImage2Base64: 'maybe',
      }),
    ).toThrow(/convertHttpImage2Base64/);
  });

  it('throws when image is not a string or string array', () => {
    expect(() =>
      composeUserPrompt({ prompt: 'p', image: 42 as unknown as string }),
    ).toThrow(/image:/);
  });

  it('throws when image/imageName counts do not match', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        image: 'https://x/a.png',
      }),
    ).toThrow(/same number/);
  });

  it('throws when imageName array contains non-string items', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        image: ['https://x/a.png'],
        imageName: [123 as unknown as string],
      }),
    ).toThrow(/imageName\[0\]/);
  });

  it('builds images array from image/imageName pairs', () => {
    const result = composeUserPrompt({
      prompt: 'p',
      image: 'https://x/a.png',
      imageName: 'a',
    });
    expect(result).toEqual({
      prompt: 'p',
      images: [{ name: 'a', url: 'https://x/a.png' }],
    });
  });

  it('throws when repeated image/imageName values are unbalanced', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        image: ['https://x/a.png'],
        imageName: [],
      }),
    ).toThrow(/same number/);
  });

  it('throws when imageName is neither a string nor a string array', () => {
    expect(() =>
      composeUserPrompt({ prompt: 'p', imageName: 42 as unknown as string }),
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

    expect(aiAssert).toHaveBeenCalledWith('login button visible', undefined);
  });

  it('forwards the custom failure message to aiAssert', async () => {
    const aiAssert = vi.fn().mockResolvedValue(undefined);
    const tools = generateCommonTools(async () => ({
      aiAssert,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const assert = tools.find((t) => t.name === 'assert')!;
    await assert.handler({
      prompt: 'login button visible',
      message: 'the login button should be visible',
    });

    expect(aiAssert).toHaveBeenCalledWith(
      'login button visible',
      'the login button should be visible',
    );
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
      image: 'https://example.com/btn.png',
      imageName: 'target',
    });

    expect(aiAssert).toHaveBeenCalledWith(
      {
        prompt: 'the visible badge matches the reference image',
        images: [{ name: 'target', url: 'https://example.com/btn.png' }],
      },
      undefined,
    );
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
      image: './fixtures/badge.png',
      imageName: 'badge',
    });

    expect(aiAssert).toHaveBeenCalledWith(
      {
        prompt: 'the visible badge matches the supplied image',
        images: [{ name: 'badge', url: './fixtures/badge.png' }],
      },
      undefined,
    );
  });

  it('exposes images and convertHttpImage2Base64 on the assert schema (no imageFiles flag)', () => {
    const tools = generateCommonTools(async () => ({
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const assertSchema = tools.find((t) => t.name === 'assert')!.schema;
    expect(assertSchema).toHaveProperty('prompt');
    expect(assertSchema).toHaveProperty('message');
    expect(assertSchema).toHaveProperty('image');
    expect(assertSchema).toHaveProperty('imageName');
    expect(assertSchema).toHaveProperty('convertHttpImage2Base64');
    expect(assertSchema).not.toHaveProperty('images');
    expect(assertSchema).not.toHaveProperty('imageFiles');

    // act schema stays string-only because the underlying core aiAct
    // does not yet parse multimodal prompts.
    const actSchema = tools.find((t) => t.name === 'act')!.schema;
    expect(actSchema).toHaveProperty('prompt');
    expect(actSchema).not.toHaveProperty('images');
    expect(actSchema).not.toHaveProperty('imageFiles');
  });
});

describe('toolDefaults (deep locate / deep think)', () => {
  it('defaults locate.deepLocate to true for action tools when enabled', async () => {
    const callActionInActionSpace = vi.fn().mockResolvedValue(undefined);
    const [tool] = generateToolsFromActionSpace(
      actionSpace,
      async () => ({
        callActionInActionSpace,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      undefined,
      { locate: { deepLocate: true } },
    );

    await tool.handler({ locate: 'the login button' });

    expect(callActionInActionSpace).toHaveBeenCalledWith('Tap', {
      locate: {
        prompt: 'the login button',
        deepLocate: true,
      },
    });
  });

  it('keeps an explicit locate.deepLocate=false even when forced', async () => {
    const callActionInActionSpace = vi.fn().mockResolvedValue(undefined);
    const [tool] = generateToolsFromActionSpace(
      actionSpace,
      async () => ({
        callActionInActionSpace,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      undefined,
      { locate: { deepLocate: true } },
    );

    await tool.handler({
      locate: { prompt: 'the login button', deepLocate: false },
    });

    expect(callActionInActionSpace).toHaveBeenCalledWith('Tap', {
      locate: {
        prompt: 'the login button',
        deepLocate: false,
      },
    });
  });

  it('treats an explicit deepThink alias as deepLocate already set', async () => {
    const callActionInActionSpace = vi.fn().mockResolvedValue(undefined);
    const [tool] = generateToolsFromActionSpace(
      actionSpace,
      async () => ({
        callActionInActionSpace,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      undefined,
      { locate: { deepLocate: true } },
    );

    await tool.handler({
      locate: { prompt: 'the login button', deepThink: false },
    });

    expect(callActionInActionSpace).toHaveBeenCalledWith('Tap', {
      locate: {
        prompt: 'the login button',
        deepThink: false,
      },
    });
  });

  it('does not inject deepLocate for action tools when disabled', async () => {
    const callActionInActionSpace = vi.fn().mockResolvedValue(undefined);
    const [tool] = generateToolsFromActionSpace(actionSpace, async () => ({
      callActionInActionSpace,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    await tool.handler({ locate: 'the login button' });

    expect(callActionInActionSpace).toHaveBeenCalledWith('Tap', {
      locate: { prompt: 'the login button' },
    });
  });

  it('passes deepLocate to the act tool when enabled', async () => {
    const aiAction = vi.fn().mockResolvedValue('done');
    const commonTools = generateCommonTools(
      async () => ({
        aiAction,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      { act: { deepLocate: true } },
    );
    const actTool = commonTools.find((tool) => tool.name === 'act');

    await actTool?.handler({ prompt: 'open settings' });

    expect(aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: false,
      deepLocate: true,
    });
  });

  it('lets an explicit act deepLocate arg override the server default', async () => {
    const aiAction = vi.fn().mockResolvedValue('done');
    const commonTools = generateCommonTools(
      async () => ({
        aiAction,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      { act: { deepLocate: true } },
    );
    const actTool = commonTools.find((tool) => tool.name === 'act');

    await actTool?.handler({ prompt: 'open settings', deepLocate: false });

    expect(aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: false,
      deepLocate: false,
    });
  });

  it('plans the act tool with deepThink when enabled', async () => {
    const aiAction = vi.fn().mockResolvedValue('done');
    const commonTools = generateCommonTools(
      async () => ({
        aiAction,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      { act: { deepThink: true } },
    );
    const actTool = commonTools.find((tool) => tool.name === 'act');

    await actTool?.handler({ prompt: 'open settings' });

    expect(aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: true,
    });
  });

  it('lets an explicit act deepThink arg override the server default', async () => {
    const aiAction = vi.fn().mockResolvedValue('done');
    const commonTools = generateCommonTools(
      async () => ({
        aiAction,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      { act: { deepThink: true } },
    );
    const actTool = commonTools.find((tool) => tool.name === 'act');

    await actTool?.handler({ prompt: 'open settings', deepThink: false });

    expect(aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: false,
    });
  });

  it('applies both locate and act defaults together', async () => {
    const aiAction = vi.fn().mockResolvedValue('done');
    const commonTools = generateCommonTools(
      async () => ({
        aiAction,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
      }),
      undefined,
      undefined,
      {
        locate: { deepLocate: true },
        act: { deepLocate: true, deepThink: true },
      },
    );
    const actTool = commonTools.find((tool) => tool.name === 'act');

    await actTool?.handler({ prompt: 'open settings' });

    expect(aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: true,
      deepLocate: true,
    });
  });
});
