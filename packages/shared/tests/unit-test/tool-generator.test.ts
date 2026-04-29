import {
  generateCommonTools,
  generateToolsFromActionSpace,
} from '@/mcp/tool-generator';
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
