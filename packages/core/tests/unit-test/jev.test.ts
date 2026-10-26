import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Insight } from '@/agent/insight';
import { runConnectivityTest } from '@/ai-model/connectivity';
import { getModelRuntime } from '@/ai-model/models';
import { mapJevBox, prepareJevImage } from '@/ai-model/models/jev/image';
import { jevPlan } from '@/ai-model/models/jev/planning';
import { resolveModelForTaskType } from '@/ai-model/models/model-fallback';
import { callSystemOneAI } from '@/ai-model/service-caller';
import { prepareSystemOne } from '@/ai-model/service-caller/system-one';
import { AiLocateElement } from '@/ai-model/workflows/grounding/locate';
import { AiExtractElementInfo } from '@/ai-model/workflows/insight';
import { ConversationHistory } from '@/ai-model/workflows/planning';
import {
  defineActionScroll,
  defineActionSleep,
  defineActionTap,
} from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { type IModelConfig, ModelConfigManager } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import sharp from 'sharp';
import { z } from 'zod';

const recording = rs.hoisted(() => ({ events: [] as Record<string, any>[] }));
rs.mock('@/ai-model/service-caller/model-call-recorder', () => ({
  isModelCallRecordingEnabled: () => true,
  recordModelCallEvent: (event: Record<string, any>) => {
    recording.events.push(event);
  },
}));

const jevConfig: IModelConfig = {
  modelName: 'jev-1.14.0',
  modelFamily: 'jev',
  modelDescription: 'jev mode',
  intent: 'locate',
  slot: 'locate',
  openaiBaseURL: 'https://api.typesafe.ai/v1',
  openaiApiKey: 'test-key',
  retryCount: 0,
  retryInterval: 0,
};
const defaultConfig: IModelConfig = {
  modelName: 'default-model',
  modelFamily: 'qwen3',
  modelDescription: '',
  intent: 'default',
  slot: 'default',
};
const goodResult = {
  model: 'jev-1.14.0',
  answers: {
    present: { type: 'noul', noul: 0.95 },
    target: {
      type: 'box',
      box: { left: 0.1, top: 0.1, right: 0.3, bottom: 0.2 },
    },
    result: { type: 'noul', noul: 0.8 },
  },
  usage: { input_tokens: 100, output_tokens: 20 },
};
const response = (data = goodResult) =>
  new Response(JSON.stringify(data), { status: 200 });
async function image(width: number, height: number) {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
async function context(width = 2000, height = 1000): Promise<UIContext> {
  return {
    screenshot: ScreenshotItem.create(await image(width, height), Date.now()),
    shotSize: { width, height },
    shrunkShotToLogicalRatio: 1,
  };
}

beforeEach(() => {
  recording.events.length = 0;
});
afterEach(() => {
  rs.restoreAllMocks();
});

describe('Jev model fallback', () => {
  const configs = {
    getModelConfig: (intent: IModelConfig['intent']) =>
      intent === 'default'
        ? defaultConfig
        : { ...jevConfig, intent, slot: intent },
  };
  it.each(['boolean', 'locate', 'planning'] as const)(
    'keeps supported %s tasks on Jev',
    (taskType) => {
      expect(
        resolveModelForTaskType(
          configs,
          taskType === 'boolean' ? 'insight' : taskType,
          taskType,
        ).config.modelFamily,
      ).toBe('jev');
    },
  );
  it.each(['extract', 'general'] as const)(
    'routes unsupported %s before requesting',
    (taskType) => {
      const runtime = resolveModelForTaskType(configs, 'insight', taskType);
      expect(runtime.config).toMatchObject({
        modelName: 'default-model',
        slot: 'default',
        intent: 'insight',
      });
      expect(runtime.modelFallback).toMatchObject({
        requestedModel: 'jev-1.14.0',
        taskType,
      });
    },
  );
  it('rejects Jev as the default model', () => {
    const configs = new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'jev',
      MIDSCENE_MODEL_FAMILY: 'jev',
      MIDSCENE_MODEL_BASE_URL: 'https://api.typesafe.ai',
      MIDSCENE_MODEL_API_KEY: 'test-key',
    });
    expect(() => configs.getModelConfig('default')).toThrow(
      'Jev cannot be the default model',
    );
  });
  it('passes explicit task types for insight APIs', async () => {
    const execute = rs.fn().mockResolvedValue({ output: true });
    const resolve = rs.fn((taskType) =>
      resolveModelForTaskType(configs, 'insight', taskType),
    );
    const insight = new Insight(
      { createTypeQueryExecution: execute },
      resolve,
      () => undefined,
    );
    await insight.aiBoolean('visible');
    await insight.aiAssert('visible');
    await insight.aiQuery('extract text');
    await insight.aiNumber('count');
    await insight.aiString('text');
    expect(resolve.mock.calls.map(([taskType]) => taskType)).toEqual([
      'boolean',
      'boolean',
      'extract',
      'extract',
      'extract',
    ]);
    expect(execute.mock.calls.map((call) => call[2].config.slot)).toEqual([
      'insight',
      'insight',
      'default',
      'default',
      'default',
    ]);
  });
});

describe('Jev requests and coordinates', () => {
  it.each([undefined, 'https://ignored.example/v1'])(
    'uses the full endpoint without appending a path (base URL: %s)',
    async (openaiBaseURL) => {
      const prepared = await prepareSystemOne(
        {
          ...jevConfig,
          openaiBaseURL,
          endpoint: 'https://example.com/custom/decision?version=2',
        },
        {
          state: {},
          questions: { answer: { type: 'noul', instructions: 'True?' } },
        },
      );
      expect(prepared.url).toBe(
        'https://example.com/custom/decision?version=2',
      );
    },
  );

  it.each([
    ['https://example.com/v2/', 'https://example.com/v2/systemone'],
    [
      'https://example.com/api/custom',
      'https://example.com/api/custom/systemone',
    ],
    ['https://example.com', 'https://example.com/systemone'],
  ])('preserves the configured API prefix %s', async (baseURL, expectedURL) => {
    const prepared = await prepareSystemOne(
      { ...jevConfig, openaiBaseURL: baseURL },
      {
        state: { text: 'hello' },
        questions: {
          greeting: { type: 'noul', instructions: 'Is this a greeting?' },
        },
      },
    );
    expect(prepared.url).toBe(expectedURL);
  });
  it.each(['jpg', 'jpeg'])(
    'encodes a local .%s reference image without changing its bytes',
    async (extension) => {
      const directory = await mkdtemp(join(tmpdir(), 'midscene-jev-image-'));
      try {
        const bytes = await sharp({
          create: {
            width: 400,
            height: 400,
            channels: 3,
            background: 'green',
          },
        })
          .jpeg()
          .toBuffer();
        const path = join(directory, `reference.${extension}`);
        await writeFile(path, bytes);
        const image = await prepareJevImage(path);
        const prepared = await prepareSystemOne(jevConfig, {
          state: {},
          images: { reference: image.imageBase64 },
          questions: {
            result: { type: 'noul', instructions: 'Is `reference` green?' },
          },
        });
        const body = JSON.parse(prepared.body);
        expect(body.assets[body.state.reference]).toEqual({
          type: 'image',
          format: 'jpg',
          data_base64: bytes.toString('base64'),
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('batches presence and box in one recorded request and restores full-size coordinates', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response());
    const runtime = {
      ...getModelRuntime(jevConfig),
      onUsage: rs.fn(),
      onRequest: rs.fn(),
    };
    const result = await AiLocateElement({
      context: await context(),
      targetElementDescription: 'button',
      modelRuntime: runtime,
    });
    expect(result.parseResult.element?.center[0]).toBeCloseTo(400);
    expect(result.parseResult.element?.center[1]).toBeCloseTo(150);
    expect(result.parseResult.element?.rect).toEqual({
      left: 200,
      top: 100,
      width: 400,
      height: 100,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(new Headers(init?.headers).get('TypeSafe-Danger-Zone-Images')).toBe(
      'true',
    );
    const body = JSON.parse(init?.body as string);
    expect(Object.keys(body.questions)).toEqual(['present', 'target']);
    expect(body.assets[body.state.screenshot].format).toBe('png');
    expect(runtime.onUsage).toHaveBeenCalledTimes(1);
    expect(runtime.onRequest).toHaveBeenCalledTimes(1);
    expect(result.usage).toMatchObject({
      request_kind: 'system-one',
      stream: false,
      total_tokens: 120,
      slot: 'locate',
    });
    expect(recording.events.map((event) => event.type)).toEqual([
      'request',
      'http-response',
      'response',
    ]);
    expect(recording.events[0]).toMatchObject({
      slot: 'locate',
      intent: 'locate',
    });
    expect(JSON.stringify(recording.events)).not.toContain('test-key');
  });
  it.each([false, true])(
    'preserves the OpenRouter image format with endpoint=%s',
    async (useEndpoint) => {
      const fetchMock = rs
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(response());
      await AiLocateElement({
        context: await context(500, 400),
        targetElementDescription: 'button',
        modelRuntime: getModelRuntime({
          ...jevConfig,
          openaiBaseURL: useEndpoint
            ? 'https://ignored.example/v1'
            : 'https://openrouter.ai/api/v1',
          endpoint: useEndpoint
            ? 'https://openrouter.ai/api/v1/systemone'
            : undefined,
        }),
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://openrouter.ai/api/v1/systemone',
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.assets).toBeUndefined();
      expect(body.state.screenshot.type).toBe('image_url');
      expect(body.state.screenshot.image_url.url).toMatch(
        /^data:image\/png;base64,/,
      );
    },
  );
  it.each([
    [100, 50],
    [3000, 30],
  ])(
    'preserves image bytes and dimensions for %i × %i',
    async (width, height) => {
      const original = await image(width, height);
      const prepared = await prepareJevImage(original);
      expect(prepared.imageBase64).toBe(original);
    },
  );
  it('maps normalized boxes to target coordinates', () => {
    const result = mapJevBox(
      { left: 0.2, top: 0.1, right: 0.6, bottom: 0.5 },
      { width: 100, height: 50 },
    );
    expect(result).toEqual({
      center: [40, 15],
      rect: { left: 20, top: 5, width: 40, height: 20 },
    });
    expect(() =>
      mapJevBox(
        { left: 1, top: 0, right: 1.2, bottom: 0.5 },
        { width: 100, height: 50 },
      ),
    ).toThrow('exceed normalized range');
  });
  it('maps a scaled DeepLocate crop exactly once', async () => {
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    const result = await AiLocateElement({
      context: await context(),
      targetElementDescription: 'button',
      modelRuntime: getModelRuntime(jevConfig),
      searchConfig: {
        sourceRect: { left: 500, top: 300, width: 1000, height: 500 },
        image: {
          imageBase64: await image(2000, 1000),
          width: 2000,
          height: 1000,
        },
        mapping: { offset: { x: 500, y: 300 }, scale: 2 },
      },
    });
    expect(result.parseResult.element?.center).toEqual([700, 375]);
  });
  it('reports an absent target without switching models', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        ...goodResult,
        answers: {
          ...goodResult.answers,
          present: { type: 'noul', noul: 0.1 },
        },
      }),
    );
    const result = await AiLocateElement({
      context: await context(),
      targetElementDescription: 'missing',
      modelRuntime: getModelRuntime(jevConfig),
    });
    expect(result.parseResult.element).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('supports text-only boolean checks and preserves false', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        ...goodResult,
        answers: {
          ...goodResult.answers,
          result: { type: 'noul', noul: 0.1 },
        },
      }),
    );
    const result = await AiExtractElementInfo({
      taskType: 'boolean',
      dataQuery: { Boolean: 'matches' },
      context: await context(),
      extractOption: { screenshotIncluded: false, context: 'context' },
      pageDescription: 'DOM',
      modelRuntime: getModelRuntime({
        ...jevConfig,
        slot: 'insight',
        intent: 'insight',
      }),
    });
    expect(result.parseResult.data).toEqual({ Boolean: false });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.assets).toBeUndefined();
    expect(body.state).toMatchObject({
      context: 'context',
      pageDescription: 'DOM',
      frames: [],
    });
  });
  it('includes screenshot sequences and reference images', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response());
    const ui = await context(500, 400);
    await AiExtractElementInfo({
      taskType: 'boolean',
      dataQuery: { StatementIsTruthy: 'appeared' },
      context: { ...ui, screenshotSequence: [ui.screenshot, ui.screenshot] },
      multimodalPrompt: {
        images: [{ name: 'target', url: await image(50, 50) }],
      },
      modelRuntime: getModelRuntime(jevConfig),
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(Object.keys(body.assets)).toHaveLength(3);
    expect(body.state.frames).toEqual(['`frame_0`', '`frame_1`']);
    expect(body.state.references).toEqual([
      { name: 'target', image: '`reference_0`' },
    ]);
  });
  it.each([
    [200, 'not JSON'],
    [200, '{"answers":{"result":{"type":"noul","noul":2}}}'],
    [200, '{"answers":{}}'],
    [400, '{"error":"invalid request"}'],
  ])(
    'records the raw HTTP response on failure (%i, %s)',
    async (status, body) => {
      rs.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(body, { status }),
      );
      await expect(
        callSystemOneAI(
          {
            state: {},
            questions: {
              result: { type: 'noul', instructions: 'Is this true?' },
            },
          },
          getModelRuntime(jevConfig),
        ),
      ).rejects.toThrow();
      expect(recording.events.map((event) => event.type)).toEqual([
        'request',
        'http-response',
        'error',
      ]);
      expect(recording.events[1]).toMatchObject({
        http: { status, ok: status === 200, body },
      });
    },
  );
  it('rejects streaming before entering the retry loop', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    await expect(
      callSystemOneAI(
        {
          state: {},
          questions: {
            result: { type: 'noul', instructions: 'Is this true?' },
          },
        },
        getModelRuntime({ ...jevConfig, retryCount: 2 }),
        { stream: true, onChunk: rs.fn() },
      ),
    ).rejects.toThrow(/^Jev does not support streaming output$/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recording.events).toEqual([]);
  });
  it('retries malformed responses without changing model', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"answers":{}}'))
      .mockResolvedValueOnce(response());
    await AiLocateElement({
      context: await context(),
      targetElementDescription: 'button',
      modelRuntime: getModelRuntime({ ...jevConfig, retryCount: 1 }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      recording.events
        .filter((event) => event.type === 'request')
        .map((event) => event.attempt),
    ).toEqual([1, 2]);
  });
  it('records fallback usage without sending a Jev request', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: 'default-response',
            model: 'default-model',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: '<data-json>{"result":"text"}</data-json>',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30,
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const configs = {
      getModelConfig: (intent: IModelConfig['intent']) =>
        intent === 'default'
          ? {
              ...defaultConfig,
              openaiBaseURL: 'https://example.com/v1',
              openaiApiKey: 'test-key',
              retryCount: 0,
            }
          : { ...jevConfig, intent, slot: intent },
    };
    const runtime = resolveModelForTaskType(configs, 'insight', 'extract');
    const result = await AiExtractElementInfo({
      taskType: 'extract',
      dataQuery: 'extract text',
      context: await context(),
      modelRuntime: runtime,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.usage).toMatchObject({
      slot: 'default',
      model_name: 'default-model',
      modelFallback: {
        requestedSlot: 'insight',
        requestedModel: 'jev-1.14.0',
        taskType: 'extract',
      },
    });
    expect(
      recording.events.find((event) => event.type === 'request'),
    ).toMatchObject({ intent: 'insight', slot: 'default' });
  });
  it('applies the request timeout to Jev without falling back', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => {}));
    await expect(
      callSystemOneAI(
        {
          state: {},
          questions: { result: { type: 'noul', instructions: 'true' } },
        },
        getModelRuntime({ ...jevConfig, timeout: 10 }),
      ),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('honors cancellation without making a request', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();
    await expect(
      callSystemOneAI(
        {
          state: {},
          questions: { result: { type: 'noul', instructions: 'true' } },
        },
        getModelRuntime(jevConfig),
        { abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('connectivity tests the configured Jev even when planning uses default at runtime', async () => {
    rs.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/systemone')
        ? response()
        : new Response(
            JSON.stringify({
              id: 'connectivity',
              model: 'default-model',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'CONNECTIVITY_OK' },
                  finish_reason: 'stop',
                },
              ],
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
    );
    const result = await runConnectivityTest({
      defaultModelConfig: {
        ...defaultConfig,
        openaiBaseURL: 'https://example.com/v1',
        openaiApiKey: 'test-key',
      },
      planningModelConfig: { ...jevConfig, intent: 'planning' },
      insightModelConfig: { ...jevConfig, intent: 'insight' },
      locateModelConfig: jevConfig,
    });
    expect(result.message).toBeUndefined();
    expect(result.passed).toBe(true);
    expect(result.requestCount).toBe(4);
    expect(result.checks.map((check) => check.modelFamily)).toEqual([
      'jev',
      'jev',
      'jev',
      'qwen3',
    ]);
  });
});

describe('Jev planning', () => {
  const planningResponse = (action: string) =>
    new Response(
      JSON.stringify({
        answers: {
          action: {
            type: 'choice',
            choice: action.includes(':')
              ? action
              : action === 'Complete'
                ? 'control:complete'
                : action === 'Delegate'
                  ? 'control:delegate'
                  : ['Scroll', 'Sleep'].includes(action)
                    ? `delegate:${action}`
                    : `action:${action}`,
          },
        },
        usage: { input_tokens: 100, output_tokens: 10 },
      }),
    );
  async function options() {
    const modelRuntime = getModelRuntime({
      ...jevConfig,
      intent: 'planning',
      slot: 'planning',
    });
    return {
      context: await context(),
      modelRuntime,
      conversationHistory: new ConversationHistory(),
      actionSpace: [
        defineActionTap(async () => {}),
        defineActionScroll(async () => {}),
        defineActionSleep(),
      ],
      includeLocateInPlanning: false,
      effort: 'balance' as const,
    };
  }
  it.each([true, false])(
    'includes target coordinates only when enabled (%s)',
    async (includeLocateInPlanning) => {
      const fetchMock = rs.spyOn(globalThis, 'fetch').mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              answers: {
                action: { type: 'choice', choice: 'action:Tap' },
                target: goodResult.answers.target,
              },
            }),
          ),
      );
      const opts = { ...(await options()), includeLocateInPlanning };
      const result = await jevPlan(
        { text: 'Submit the form', referenceImages: [] },
        opts,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.questions.target?.type).toBe(
        includeLocateInPlanning ? 'box' : undefined,
      );
      expect(result.actions?.[0]?.param.locate.locatedPixelResult).toEqual(
        includeLocateInPlanning
          ? {
              center: [400, expect.closeTo(150)],
              rect: { left: 200, top: 100, width: 400, height: 100 },
            }
          : undefined,
      );
    },
  );

  it('ignores the returned target when the task is complete', async () => {
    rs.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            answers: {
              action: { type: 'choice', choice: 'control:complete' },
              target: goodResult.answers.target,
            },
          }),
        ),
    );
    const result = await jevPlan(
      { text: 'Submit the form', referenceImages: [] },
      { ...(await options()), includeLocateInPlanning: true },
    );
    expect(result.actions).toEqual([]);
    expect(result.finalizeSuccess).toBe(true);
  });

  it('rejects a missing target for a direct single-target action', async () => {
    rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      planningResponse('Tap'),
    );
    await expect(
      jevPlan(
        { text: 'Submit the form', referenceImages: [] },
        { ...(await options()), includeLocateInPlanning: true },
      ),
    ).rejects.toThrow('Missing or invalid Jev answer: target');
  });

  it.each(['Tap', 'Complete'])(
    'plans %s without a general model',
    async (action) => {
      const fetchMock = rs
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => planningResponse(action));
      const opts = await options();
      opts.conversationHistory.pendingFeedbackMessage =
        'Previous tap succeeded';
      const result = await jevPlan(
        { text: 'Open the next item', referenceImages: [] },
        opts,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.shouldContinuePlanning).toBe(action !== 'Complete');
      expect(result.actions?.[0]?.type).toBe(
        action === 'Complete' ? undefined : action,
      );
      if (action === 'Tap') {
        expect(result.actions?.[0]?.param.locate.prompt).toContain(
          'Previous tap succeeded',
        );
        expect(result.actions?.[0]?.param.locate.bbox).toBeUndefined();
      }
      expect(opts.conversationHistory.pendingFeedbackMessage).toBe('');
      expect(result.usage?.slot).toBe('planning');
    },
  );
  it.each(['Tap'])(
    'keeps %s planning independent of the Locate model',
    async (action) => {
      rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        planningResponse(action),
      );
      const getDefaultModelRuntime = rs.fn(() =>
        getModelRuntime(defaultConfig),
      );
      const result = await jevPlan(
        { text: 'Submit the form', referenceImages: [] },
        {
          ...(await options()),
          getDefaultModelRuntime,
        },
      );
      expect(getDefaultModelRuntime).not.toHaveBeenCalled();
      expect(result.actions?.[0]?.type).toBe(action);
      expect(result.actions?.[0]?.param.locate.prompt).toContain(
        'Submit the form',
      );
    },
  );
  it.each(['Delegate', 'Scroll', 'Sleep'])(
    'returns delegation for %s without calling the default planner',
    async (action) => {
      rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        planningResponse(action),
      );
      const opts = await options();
      const fallback = rs.fn(async (_instruction: unknown, _options: any) => ({
        actions: [],
        log: 'default planning',
        shouldContinuePlanning: false,
      }));
      const base = getModelRuntime(defaultConfig);
      const getDefaultModelRuntime = () => ({
        ...base,
        adapter: {
          ...base.adapter,
          planning: {
            ...base.adapter.planning,
            kind: 'custom' as const,
            planFn: fallback,
          },
        },
      });
      const instruction = { text: 'Type a greeting', referenceImages: [] };
      opts.conversationHistory.pendingFeedbackMessage = 'Input is empty';
      const planOptions = {
        ...opts,
        planningAdvice: 'Old planning advice',
        getDefaultModelRuntime,
      };
      const decision = await jevPlan(instruction, planOptions);
      expect(fallback).not.toHaveBeenCalled();
      expect(decision.log).toContain('Jev selected');
      expect(decision.actions).toEqual([]);
      expect(decision.shouldContinuePlanning).toBe(true);
      expect(decision.delegation).toMatchObject({
        suggestedAction: action === 'Delegate' ? undefined : action,
      });
      expect(opts.conversationHistory.pendingFeedbackMessage).toBe(
        'Input is empty',
      );
    },
  );
  it('uses locator metadata for a custom direct action', async () => {
    rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      planningResponse('action:CustomTap'),
    );
    const opts = await options();
    const result = await jevPlan(
      { text: 'Select the item', referenceImages: [] },
      {
        ...opts,
        actionSpace: [
          { ...defineActionTap(async () => {}), name: 'CustomTap' },
        ],
      },
    );
    expect(result.actions?.[0]?.type).toBe('CustomTap');
    expect(result.actions?.[0]?.param.locate.prompt).toContain('CustomTap');
    expect(result.actions?.[0]?.param.locate.prompt).toContain(
      'Select the item',
    );
  });

  it('rejects direct actions that require generated text parameters', async () => {
    rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      planningResponse('action:CustomInput'),
    );
    const call = rs.fn();
    await expect(
      jevPlan(
        { text: 'Enter a greeting', referenceImages: [] },
        {
          ...(await options()),
          actionSpace: [
            {
              name: 'CustomInput',
              supportedBySystemOne: true,
              paramSchema: z.object({ value: z.string() }),
              call,
            },
          ],
        },
      ),
    ).rejects.toThrow(/value/);
    expect(call).not.toHaveBeenCalled();
  });

  it('accepts 253 actions plus two control choices', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => planningResponse('action:Custom252'));
    const getDefaultModelRuntime = rs.fn();
    const result = await jevPlan(
      { text: 'Continue', referenceImages: [] },
      {
        ...(await options()),
        actionSpace: Array.from({ length: 253 }, (_, i) => ({
          name: `Custom${i}`,
          supportedBySystemOne: true,
          call: async () => {},
        })),
        getDefaultModelRuntime,
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(Object.keys(body.questions.action.criteria)).toHaveLength(255);
    expect(result.actions).toEqual([{ type: 'Custom252', param: {} }]);
    expect(getDefaultModelRuntime).not.toHaveBeenCalled();
  });

  it('rejects oversized action spaces without calling either model', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    const opts = await options();
    const getDefaultModelRuntime = rs.fn(() => getModelRuntime(defaultConfig));
    await expect(
      jevPlan(
        { text: 'Continue', referenceImages: [] },
        {
          ...opts,
          actionSpace: Array.from({ length: 254 }, (_, i) => ({
            name: `Custom${i}`,
            call: async () => {},
          })),
          getDefaultModelRuntime,
        },
      ),
    ).rejects.toThrow('Jev planning supports at most 253 actions');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getDefaultModelRuntime).not.toHaveBeenCalled();
  });

  it('maps custom actions without colliding with control options', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        planningResponse('action:control:complete'),
      );
    const opts = await options();
    const result = await jevPlan(
      { text: 'Run custom action', referenceImages: [] },
      {
        ...opts,
        actionSpace: [
          {
            name: 'control:complete',
            supportedBySystemOne: true,
            call: async () => {},
          },
          { name: 'Input', call: async () => {} },
          { name: 'Complete', call: async () => {} },
        ],
      },
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(Object.keys(body.questions.action.criteria)).toEqual([
      'control:complete',
      'control:delegate',
      'action:control:complete',
      'delegate:Input',
      'delegate:Complete',
    ]);
    expect(body.questions.direction).toBeUndefined();
    expect(result.actions?.[0]).toEqual({
      type: 'control:complete',
      param: {},
    });
    expect(result.shouldContinuePlanning).toBe(true);
  });

  it('returns a custom action name as a delegation suggestion', async () => {
    rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      planningResponse('delegate:CustomInput'),
    );
    const opts = await options();
    const base = getModelRuntime(defaultConfig);
    const fallback = rs.fn(
      async (_instruction: unknown, _options: unknown) => ({
        actions: [],
        log: 'Default planner completed the task',
        shouldContinuePlanning: false,
        finalizeSuccess: true,
        finalizeMessage: 'done',
      }),
    );
    const actionSpace = [
      {
        name: 'CustomInput',
        description: 'Type a greeting',
        call: async () => {},
      },
    ];
    const instruction = { text: 'Enter Hello World', referenceImages: [] };
    const planOptions = {
      ...opts,
      actionSpace,
      actionContext: 'Existing context',
      getDefaultModelRuntime: () => ({
        ...base,
        adapter: {
          ...base.adapter,
          planning: {
            ...base.adapter.planning,
            kind: 'custom' as const,
            planFn: fallback,
          },
        },
      }),
    };
    const decision = await jevPlan(instruction, planOptions);
    expect(fallback).not.toHaveBeenCalled();
    expect(decision.delegation?.suggestedAction).toBe('CustomInput');
    expect(decision.actions).toEqual([]);
    expect(decision.shouldContinuePlanning).toBe(true);
  });

  it('rejects an action outside the offered choices without delegation', async () => {
    rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      planningResponse('Input'),
    );
    const getDefaultModelRuntime = rs.fn();
    await expect(
      jevPlan(
        { text: 'Type text', referenceImages: [] },
        { ...(await options()), getDefaultModelRuntime },
      ),
    ).rejects.toThrow('Invalid Jev choice');
    expect(getDefaultModelRuntime).not.toHaveBeenCalled();
  });
});
