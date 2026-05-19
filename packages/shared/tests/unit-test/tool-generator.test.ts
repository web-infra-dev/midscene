import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  composeUserPrompt,
  generateCommonTools,
  generateToolsFromActionSpace,
} from '@/mcp/tool-generator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mcp-compose-prompt-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the bare string when no image inputs are provided', () => {
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

  it('accepts a native images array', () => {
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

  it('reads imageFiles from disk and inlines them as data URIs', () => {
    const filePath = join(tmpDir, 'red.png');
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = composeUserPrompt({
      prompt: 'find the red marker',
      imageFiles: filePath,
    });

    expect(result).toMatchObject({
      prompt: 'find the red marker',
      images: [
        {
          name: 'red.png',
          url: expect.stringMatching(/^data:image\/png;base64,/),
        },
      ],
    });
  });

  it('parses comma-separated imageFiles', () => {
    const a = join(tmpDir, 'a.jpg');
    const b = join(tmpDir, 'b.jpeg');
    writeFileSync(a, Buffer.from([0xff, 0xd8]));
    writeFileSync(b, Buffer.from([0xff, 0xd8]));

    const result = composeUserPrompt({
      prompt: 'merge a and b',
      imageFiles: `${a},${b}`,
    }) as { images: { name: string; url: string }[] };

    expect(result.images.map((image) => image.name)).toEqual([
      'a.jpg',
      'b.jpeg',
    ]);
    for (const image of result.images) {
      expect(image.url).toMatch(/^data:image\/jpeg;base64,/);
    }
  });

  it('throws a clear error when an imageFile is missing', () => {
    expect(() =>
      composeUserPrompt({
        prompt: 'p',
        imageFiles: join(tmpDir, 'does-not-exist.png'),
      }),
    ).toThrow(/imageFiles: file not found/);
  });

  it('throws for unsupported imageFile extensions', () => {
    const filePath = join(tmpDir, 'note.txt');
    writeFileSync(filePath, 'hello');

    expect(() =>
      composeUserPrompt({ prompt: 'p', imageFiles: filePath }),
    ).toThrow(/imageFiles: unsupported image extension/);
  });

  it('throws when images is a non-JSON string', () => {
    expect(() =>
      composeUserPrompt({ prompt: 'p', images: 'not-json' }),
    ).toThrow(/images: expected a JSON array/);
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

  it('forwards imageFiles to aiAssert encoded as data URIs', async () => {
    const aiAssert = vi.fn().mockResolvedValue(undefined);
    const tools = generateCommonTools(async () => ({
      aiAssert,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const dir = join(tmpdir(), `assert-imgfiles-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'badge.png');
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    try {
      const assert = tools.find((t) => t.name === 'assert')!;
      await assert.handler({
        prompt: 'the visible badge matches the supplied image',
        imageFiles: filePath,
      });

      expect(aiAssert).toHaveBeenCalledTimes(1);
      const [arg] = aiAssert.mock.calls[0];
      expect(arg).toMatchObject({
        prompt: 'the visible badge matches the supplied image',
        images: [
          {
            name: 'badge.png',
            url: expect.stringMatching(/^data:image\/png;base64,/),
          },
        ],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes images, imageFiles, and convertHttpImage2Base64 on the assert schema', () => {
    const tools = generateCommonTools(async () => ({
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));

    const assertSchema = tools.find((t) => t.name === 'assert')!.schema;
    expect(assertSchema).toHaveProperty('prompt');
    expect(assertSchema).toHaveProperty('images');
    expect(assertSchema).toHaveProperty('imageFiles');
    expect(assertSchema).toHaveProperty('convertHttpImage2Base64');

    // act schema stays string-only because the underlying core aiAct
    // does not yet parse multimodal prompts.
    const actSchema = tools.find((t) => t.name === 'act')!.schema;
    expect(actSchema).toHaveProperty('prompt');
    expect(actSchema).not.toHaveProperty('images');
    expect(actSchema).not.toHaveProperty('imageFiles');
  });
});
