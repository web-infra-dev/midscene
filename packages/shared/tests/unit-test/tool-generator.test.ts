import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateCommonTools,
  generateToolsFromActionSpace,
} from '@/agent-tools/tool-generator';
import { composeUserPrompt } from '@/agent-tools/user-prompt';
import { withCliVerboseContext } from '@/cli';
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

  it('preserves locate field descriptions after making locate.prompt optional', () => {
    const [tool] = generateToolsFromActionSpace(
      [
        {
          name: 'Tap',
          description: 'Tap the element',
          paramSchema: z.object({
            locate: locateSchema.describe('The element to be tapped'),
          }),
        },
      ],
      async () => ({
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: {
          screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
        },
      }),
    );

    expect(tool.schema.locate.description).toBe('The element to be tapped');
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

    expect(commonTools.find((tool) => tool.name === 'observe')?.schema).toEqual(
      expect.objectContaining({
        action: expect.anything(),
        prompt: expect.anything(),
        'android.deviceId': expect.anything(),
      }),
    );
    expect(commonTools.find((tool) => tool.name === 'observe')?.cli).toEqual({
      options: expect.objectContaining({
        intervalMs: {
          preferredName: 'interval-ms',
          aliases: ['intervalMs'],
        },
        deepThink: {
          preferredName: 'deep-think',
          aliases: ['deepThink'],
        },
        'android.deviceId': {
          preferredName: 'device-id',
          aliases: ['deviceId'],
        },
      }),
    });

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

  it('observes an action and asserts against the stopped frame window', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const observerAssert = vi.fn().mockResolvedValue(undefined);
    const startObserving = vi.fn().mockResolvedValue({
      stop,
      aiAssert: observerAssert,
    });
    const aiAction = vi.fn().mockResolvedValue('Submitted');
    const commonTools = generateCommonTools(
      async () => ({
        aiAction,
        startObserving,
        getActionSpace: vi.fn().mockResolvedValue([]),
        page: {
          screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
        },
      }),
      undefined,
      undefined,
      { act: { deepLocate: true } },
    );
    const observeTool = commonTools.find((tool) => tool.name === 'observe');

    const result = await observeTool?.handler({
      action: 'click the Submit button',
      prompt: 'a success toast appeared during submission',
      message: 'success toast should appear',
      intervalMs: 250,
      maxFrames: 12,
      watchdogMs: 5000,
      deepThink: true,
    });

    expect(startObserving).toHaveBeenCalledWith({
      intervalMs: 250,
      maxFrames: 12,
      watchdogMs: 5000,
    });
    expect(aiAction).toHaveBeenCalledWith('click the Submit button', {
      deepThink: true,
      deepLocate: true,
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(observerAssert).toHaveBeenCalledWith(
      'a success toast appeared during submission',
      'success toast should appear',
    );
    expect(startObserving.mock.invocationCallOrder[0]).toBeLessThan(
      aiAction.mock.invocationCallOrder[0],
    );
    expect(aiAction.mock.invocationCallOrder[0]).toBeLessThan(
      stop.mock.invocationCallOrder[0],
    );
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(
      observerAssert.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Action "observe" completed.' },
        { type: 'text', text: 'Result: Submitted' },
        { type: 'image', data: 'Zm9v', mimeType: 'image/png' },
      ],
    });
  });

  it('stops observing and skips the assertion when the action fails', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const observerAssert = vi.fn().mockResolvedValue(undefined);
    const startObserving = vi.fn().mockResolvedValue({
      stop,
      aiAssert: observerAssert,
    });
    const aiAction = vi.fn().mockRejectedValue(new Error('action failed'));
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      startObserving,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: {
        screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
      },
    }));
    const observeTool = commonTools.find((tool) => tool.name === 'observe');
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await observeTool?.handler({
      action: 'click the Submit button',
      prompt: 'a success toast appeared',
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(observerAssert).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Failed to execute observe: action failed' },
      ],
      isError: true,
    });
    consoleErrorSpy.mockRestore();
  });

  it('fails clearly without running the action when startObserving is unavailable', async () => {
    const aiAction = vi.fn().mockResolvedValue('Submitted');
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: {
        screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
      },
    }));
    const observeTool = commonTools.find((tool) => tool.name === 'observe');

    const result = await observeTool?.handler({
      action: 'click the Submit button',
      prompt: 'a success toast appeared',
    });

    expect(aiAction).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'observe is not supported because this agent does not provide startObserving',
        },
      ],
      isError: true,
    });
  });

  it('rejects missing observe prompts before creating an agent', async () => {
    const getAgent = vi.fn();
    const commonTools = generateCommonTools(getAgent);
    const observeTool = commonTools.find((tool) => tool.name === 'observe');

    const missingAction = await observeTool?.handler({
      prompt: 'a success toast appeared',
    });
    const missingPrompt = await observeTool?.handler({
      action: 'click the Submit button',
    });

    expect(getAgent).not.toHaveBeenCalled();
    expect(missingAction).toEqual({
      content: [
        {
          type: 'text',
          text: 'observe requires a non-empty --action option',
        },
      ],
      isError: true,
    });
    expect(missingPrompt).toEqual({
      content: [
        {
          type: 'text',
          text: 'observe requires a non-empty --prompt option',
        },
      ],
      isError: true,
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

  it('emits human-readable aiAct verbose timeline while act is running', async () => {
    let dumpListener:
      | ((dump: string, executionDump?: unknown) => void)
      | undefined;
    let progressListener:
      | ((event: Record<string, unknown>) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const reportFile = join(
      process.cwd(),
      'midscene_run/report/midscene-report.html',
    );
    let sequence = 1;
    const emitProgress = (event: Record<string, unknown>) => {
      const { event: phase, ...data } = event;
      progressListener?.({
        scope: 'aiAct',
        phase,
        sequence: sequence++,
        data,
      });
    };
    const progressScreenshot = (id: string) => ({
      toSerializable: () => ({
        type: 'midscene_screenshot_ref',
        id,
        storage: 'file',
        path: `./screenshots/${id}.png`,
      }),
    });
    const plan1 = {
      taskId: 'plan-1',
      type: 'Planning',
      subType: 'Plan',
      status: 'finished',
      param: {
        userInstruction: 'open settings',
        replanningCycleLimit: 10,
      },
      uiContext: {
        screenshot: {
          toSerializable: () => ({
            type: 'midscene_screenshot_ref',
            id: 'shot-1',
            storage: 'file',
            path: './screenshots/shot-1.png',
          }),
        },
      },
      output: {
        log: 'Need to open settings first.',
        actions: [
          {
            type: 'Tap',
            param: { locate: { prompt: 'Submit button' } },
          },
        ],
        shouldContinuePlanning: true,
      },
      timing: { cost: 20 },
    };
    const locate1 = {
      taskId: 'locate-1',
      type: 'Planning',
      subType: 'Locate',
      status: 'finished',
      param: { prompt: 'Submit button' },
      output: {
        element: {
          description: 'Submit button',
          center: [100, 200],
          rect: { left: 80, top: 180, width: 40, height: 40 },
        },
      },
      timing: { cost: 12 },
    };
    const tapRunning = {
      taskId: 'tap-1',
      type: 'Action Space',
      subType: 'Tap',
      status: 'running',
      param: {
        locate: {
          description: 'Submit button',
          center: [100, 200],
          rect: { left: 80, top: 180, width: 40, height: 40 },
        },
      },
    };
    const tapStringPending = {
      taskId: 'tap-string',
      type: 'Action Space',
      subType: 'Tap',
      status: 'pending',
      param: { locate: 'Submit button' },
    };
    const tapPending = {
      taskId: 'tap-1',
      type: 'Action Space',
      subType: 'Tap',
      status: 'pending',
      param: {
        locate: {
          prompt: 'Submit button',
          bbox: [8, 18, 12, 22],
          locatedPixelBbox: [80, 180, 120, 220],
        },
      },
    };
    const tapFinished = {
      ...tapRunning,
      status: 'finished',
      timing: { cost: 208 },
    };
    const plan2 = {
      taskId: 'plan-2',
      type: 'Planning',
      subType: 'Plan',
      status: 'finished',
      param: {
        userInstruction: 'open settings',
        replanningCycleLimit: 10,
      },
      uiContext: {
        screenshot: {
          toSerializable: () => ({
            type: 'midscene_screenshot_ref',
            id: 'shot-2',
            storage: 'file',
            path: './screenshots/shot-2.png',
          }),
        },
      },
      output: {
        log: 'The page is still transitioning, so wait briefly.',
        actions: [
          {
            type: 'Sleep',
            param: { timeMs: 2000 },
          },
        ],
        shouldContinuePlanning: true,
      },
    };
    const sleepRunning = {
      taskId: 'sleep-1',
      type: 'Action Space',
      subType: 'Sleep',
      status: 'running',
      param: { timeMs: 2000 },
    };
    const sleepFinished = {
      ...sleepRunning,
      status: 'finished',
      timing: { cost: 2004 },
    };
    const plan3 = {
      taskId: 'plan-3',
      type: 'Planning',
      subType: 'Plan',
      status: 'finished',
      param: {
        userInstruction: 'open settings',
        replanningCycleLimit: 10,
      },
      uiContext: {
        screenshot: {
          toSerializable: () => ({
            type: 'midscene_screenshot_ref',
            id: 'shot-3',
            storage: 'file',
            path: './screenshots/shot-3.png',
          }),
        },
      },
      output: {
        log: 'The selected page is open, so the requested task is complete.',
        output: 'Settings opened.',
        shouldContinuePlanning: false,
      },
    };
    const emitDump = (tasks: unknown[]) => {
      dumpListener?.('{}', {
        id: 'execution-1',
        name: 'Act - open settings',
        description: 'open settings',
        tasks,
      });
    };
    const aiAction = vi.fn().mockImplementation(async () => {
      emitProgress({
        event: 'start',
        prompt: 'open settings',
        planLimit: 10,
      });
      emitProgress({
        event: 'plan_thinking',
        planIndex: 1,
        planLimit: 10,
        screenshot: progressScreenshot('shot-1'),
      });
      emitProgress({
        event: 'plan_planned',
        planIndex: 1,
        planLimit: 10,
        log: 'Need to open settings first.',
      });
      emitProgress({
        event: 'plan_action',
        planIndex: 1,
        planLimit: 10,
        action: {
          name: 'Tap',
          target: 'Submit button',
          point: [100, 200],
          bbox: [80, 180, 120, 220],
        },
      });
      emitProgress({
        event: 'action_running',
        planIndex: 1,
        planLimit: 10,
        action: { name: 'Tap', point: [100, 200] },
      });
      emitProgress({
        event: 'action_done',
        planIndex: 1,
        planLimit: 10,
        action: { name: 'Tap' },
        durationMs: 208,
      });
      emitProgress({
        event: 'plan_thinking',
        planIndex: 2,
        planLimit: 10,
        screenshot: progressScreenshot('shot-2'),
      });
      emitProgress({
        event: 'plan_planned',
        planIndex: 2,
        planLimit: 10,
        log: 'The page is still transitioning, so wait briefly.',
      });
      emitProgress({
        event: 'plan_action',
        planIndex: 2,
        planLimit: 10,
        action: { name: 'Sleep', param: { timeMs: 2000 } },
      });
      emitProgress({
        event: 'action_running',
        planIndex: 2,
        planLimit: 10,
        action: { name: 'Sleep', param: { timeMs: 2000 } },
      });
      emitProgress({
        event: 'action_done',
        planIndex: 2,
        planLimit: 10,
        action: { name: 'Sleep' },
        durationMs: 2004,
      });
      emitProgress({
        event: 'plan_thinking',
        planIndex: 3,
        planLimit: 10,
        screenshot: progressScreenshot('shot-3'),
      });
      emitProgress({
        event: 'plan_planned',
        planIndex: 3,
        planLimit: 10,
        log: 'The selected page is open, so the requested task is complete.',
      });
      emitProgress({
        event: 'complete',
        planIndex: 3,
        planLimit: 10,
        output: 'Settings opened.',
      });
      emitDump([plan1, tapStringPending]);
      emitDump([plan1, tapPending]);
      emitDump([plan1, locate1, tapRunning]);
      emitDump([plan1, locate1, tapFinished]);
      emitDump([plan1, locate1, tapFinished, plan2, sleepRunning]);
      emitDump([plan1, locate1, tapFinished, plan2, sleepFinished]);
      emitDump([plan1, locate1, tapFinished, plan2, sleepFinished, plan3]);
      return 'Settings opened.';
    });
    const addDumpUpdateListener = vi.fn((listener) => {
      dumpListener = listener;
      return unsubscribe;
    });
    const addProgressListener = vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    });
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      addProgressListener,
      addDumpUpdateListener,
      reportFile,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));
    const actTool = commonTools.find((tool) => tool.name === 'act');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await withCliVerboseContext(
      {
        enabled: true,
        scriptName: 'midscene-web',
        commandName: 'act',
      },
      async () => {
        await actTool?.handler({ prompt: 'open settings' });
      },
    );

    const messages = consoleSpy.mock.calls.flatMap(([message]) =>
      String(message).split('\n'),
    );
    expect(messages).toContain('[Midscene][aiAct] Start: open settings');
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 1/10] Thinking with the latest screenshot: midscene_run/report/screenshots/shot-1.png',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 1/10] Planned: Need to open settings first.',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 1/10] Action: Tap "Submit button" at (100, 200), bbox=(80,180,120,220)',
    );
    expect(messages).not.toContain(
      '[Midscene][aiAct][Plan 1/10] Action: Tap: {"locate":"Submit button"}',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Action] Running: Tap at (100, 200)',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Action] Done: Tap cost=208ms',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 2/10] Thinking with the latest screenshot: midscene_run/report/screenshots/shot-2.png',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 2/10] Planned: The page is still transitioning, so wait briefly.',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 2/10] Action: Sleep 2000ms',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Action] Running: Sleep 2000ms',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Action] Done: Sleep cost=2004ms',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 3/10] Thinking with the latest screenshot: midscene_run/report/screenshots/shot-3.png',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 3/10] Planned: The selected page is open, so the requested task is complete.',
    );
    expect(messages).toContain('[Midscene][aiAct] Complete: Settings opened.');
    expect(
      messages.filter((message) =>
        message.includes('[Midscene][aiAct][Plan 1/10] Action: Tap'),
      ),
    ).toHaveLength(1);
    expect(addProgressListener).toHaveBeenCalledOnce();
    expect(addDumpUpdateListener).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('does not render aiAct dump progress without core progress listener', async () => {
    const unsubscribe = vi.fn();
    const aiAction = vi.fn().mockResolvedValue('Settings opened.');
    const addDumpUpdateListener = vi.fn(() => unsubscribe);
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      addDumpUpdateListener,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));
    const actTool = commonTools.find((tool) => tool.name === 'act');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await withCliVerboseContext(
      {
        enabled: true,
        scriptName: 'midscene-web',
        commandName: 'act',
      },
      async () => {
        await actTool?.handler({ prompt: 'open settings' });
      },
    );

    const messages = consoleSpy.mock.calls.flatMap(([message]) =>
      String(message).split('\n'),
    );
    expect(
      messages.some((message) => message.startsWith('[Midscene][aiAct]')),
    ).toBe(false);
    expect(addDumpUpdateListener).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('emits human-readable aiAct planning failure details', async () => {
    let dumpListener:
      | ((dump: string, executionDump?: unknown) => void)
      | undefined;
    let progressListener:
      | ((event: Record<string, unknown>) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const reportFile = join(
      process.cwd(),
      'midscene_run/report/midscene-report.html',
    );
    let sequence = 1;
    const emitProgress = (event: Record<string, unknown>) => {
      const { event: phase, ...data } = event;
      progressListener?.({
        scope: 'aiAct',
        phase,
        sequence: sequence++,
        data,
      });
    };
    const aiAction = vi.fn().mockImplementation(async () => {
      emitProgress({
        event: 'start',
        prompt: 'open settings',
        planLimit: 3,
      });
      emitProgress({
        event: 'plan_thinking',
        planIndex: 1,
        planLimit: 3,
        screenshot: {
          toSerializable: () => ({
            type: 'midscene_screenshot_ref',
            id: 'failed-shot',
            storage: 'file',
            path: './screenshots/failed-shot.png',
          }),
        },
      });
      emitProgress({
        event: 'plan_failed',
        planIndex: 1,
        planLimit: 3,
        message: 'Task failed: The settings entry is not visible.',
        error: 'Task failed: The settings entry is not visible.',
      });
      dumpListener?.('{}', {
        id: 'execution-1',
        name: 'Act - open settings',
        description: 'open settings',
        tasks: [
          {
            taskId: 'plan-failed',
            type: 'Planning',
            subType: 'Plan',
            status: 'failed',
            param: {
              userInstruction: 'open settings',
              replanningCycleLimit: 3,
            },
            uiContext: {
              screenshot: {
                toSerializable: () => ({
                  type: 'midscene_screenshot_ref',
                  id: 'failed-shot',
                  storage: 'file',
                  path: './screenshots/failed-shot.png',
                }),
              },
            },
            output: {
              log: 'The settings entry is not visible.',
              shouldContinuePlanning: false,
            },
            errorMessage: 'Task failed: The settings entry is not visible.',
          },
        ],
      });
      throw new Error('Task failed: The settings entry is not visible.');
    });
    const addDumpUpdateListener = vi.fn((listener) => {
      dumpListener = listener;
      return unsubscribe;
    });
    const addProgressListener = vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    });
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      addProgressListener,
      addDumpUpdateListener,
      reportFile,
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));
    const actTool = commonTools.find((tool) => tool.name === 'act');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await withCliVerboseContext(
      {
        enabled: true,
        scriptName: 'midscene-web',
        commandName: 'act',
      },
      async () => actTool?.handler({ prompt: 'open settings' }),
    );

    const messages = consoleSpy.mock.calls.flatMap(([message]) =>
      String(message).split('\n'),
    );
    expect(result?.isError).toBe(true);
    expect(messages).toContain('[Midscene][aiAct] Start: open settings');
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 1/3] Thinking with the latest screenshot: midscene_run/report/screenshots/failed-shot.png',
    );
    expect(messages).toContain(
      '[Midscene][aiAct][Plan 1/3] Failed: Task failed: The settings entry is not visible.',
    );
    expect(messages).not.toContain(
      '[Midscene][aiAct] Complete: The settings entry is not visible.',
    );
    expect(addProgressListener).toHaveBeenCalledOnce();
    expect(addDumpUpdateListener).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('exports inline verbose dump screenshots to readable file paths', async () => {
    let dumpListener:
      | ((dump: string, executionDump?: unknown) => void)
      | undefined;
    let progressListener:
      | ((event: Record<string, unknown>) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const inlineScreenshot = {
      extension: 'png',
      rawBase64: 'Zm9v',
      toSerializable: () => ({
        type: 'midscene_screenshot_ref',
        id: 'inline-shot-1',
        capturedAt: 1000,
        mimeType: 'image/png',
        storage: 'inline',
      }),
    };
    const aiAction = vi.fn().mockImplementation(async () => {
      progressListener?.({
        scope: 'aiAct',
        sequence: 1,
        phase: 'plan_thinking',
        data: {
          planIndex: 1,
          screenshot: inlineScreenshot,
        },
      });
      dumpListener?.('{}', {
        id: 'execution-1',
        name: 'Act - open settings',
        tasks: [
          {
            taskId: 'plan-1',
            type: 'Planning',
            subType: 'Plan',
            status: 'running',
            param: { userInstruction: 'open settings' },
            uiContext: {
              screenshot: inlineScreenshot,
            },
            recorder: [
              {
                timing: 'after-calling',
                screenshot: inlineScreenshot,
              },
            ],
          },
        ],
      });
      return 'done';
    });
    const addDumpUpdateListener = vi.fn((listener) => {
      dumpListener = listener;
      return unsubscribe;
    });
    const addProgressListener = vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    });
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      addProgressListener,
      addDumpUpdateListener,
      reportFile: '/tmp/midscene-report.html',
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));
    const actTool = commonTools.find((tool) => tool.name === 'act');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await withCliVerboseContext(
      {
        enabled: true,
        scriptName: 'midscene-web',
        commandName: 'act',
      },
      async () => {
        await actTool?.handler({ prompt: 'open settings' });
      },
    );

    const messages = consoleSpy.mock.calls.flatMap(([message]) =>
      String(message).split('\n'),
    );
    const screenshotMessage = messages.find((message) =>
      message.includes(
        '[Midscene][aiAct][Plan 1] Thinking with the latest screenshot: ',
      ),
    );
    expect(screenshotMessage).toMatch(
      /^\[Midscene\]\[aiAct\]\[Plan 1\] Thinking with the latest screenshot: .+screenshots\/inline-shot-1\.png$/,
    );
    const screenshotPath = screenshotMessage?.replace(
      '[Midscene][aiAct][Plan 1] Thinking with the latest screenshot: ',
      '',
    );
    expect(screenshotPath).toBeDefined();
    expect(existsSync(screenshotPath!)).toBe(true);
    expect(readFileSync(screenshotPath!, 'utf8')).toBe('foo');
    expect(addProgressListener).toHaveBeenCalledOnce();
    expect(addDumpUpdateListener).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('emits jsonl aiAct progress events while act is running', async () => {
    let progressListener:
      | ((event: Record<string, unknown>) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const aiAction = vi.fn().mockImplementation(async () => {
      progressListener?.({
        scope: 'aiAct',
        sequence: 1,
        phase: 'plan_thinking',
        data: {
          planIndex: 1,
          planLimit: 3,
          screenshot: {
            toSerializable: () => ({
              type: 'midscene_screenshot_ref',
              id: 'shot-1',
              storage: 'file',
              path: './screenshots/shot-1.png',
            }),
          },
        },
      });
      return 'done';
    });
    const addDumpUpdateListener = vi.fn(() => unsubscribe);
    const addProgressListener = vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    });
    const commonTools = generateCommonTools(async () => ({
      aiAction,
      addProgressListener,
      addDumpUpdateListener,
      reportFile: '/tmp/midscene-report.html',
      getActionSpace: vi.fn().mockResolvedValue([]),
      page: { screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64) },
    }));
    const actTool = commonTools.find((tool) => tool.name === 'act');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await withCliVerboseContext(
      {
        enabled: true,
        format: 'jsonl',
        scriptName: 'midscene-web',
        commandName: 'act',
      },
      async () => {
        await actTool?.handler({ prompt: 'open settings' });
      },
    );

    const progressEvents = consoleSpy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes('"type":"midscene_progress"'))
      .map((message) => JSON.parse(message));
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        event: 'agent_ready',
        scriptName: 'midscene-web',
        command: 'act',
        tool: 'act',
      }),
    );
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        event: 'agent_progress',
        command: 'act',
        tool: 'act',
        scope: 'aiAct',
        progress: expect.objectContaining({
          phase: 'plan_thinking',
          sequence: 1,
          planIndex: 1,
          planLimit: 3,
          screenshots: [
            expect.objectContaining({
              id: 'shot-1',
              storage: 'file',
              path: './screenshots/shot-1.png',
            }),
          ],
        }),
      }),
    );
    expect(addProgressListener).toHaveBeenCalledOnce();
    expect(addDumpUpdateListener).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
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
