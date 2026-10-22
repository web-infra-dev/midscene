import { Insight } from '@/agent/insight';
import { runConnectivityTest } from '@/ai-model/connectivity';
import { getModelRuntime } from '@/ai-model/models';
import { mapJevBox, prepareJevImage } from '@/ai-model/models/jev/image';
import { jevPlan } from '@/ai-model/models/jev/planning';
import { resolveModelForTask } from '@/ai-model/models/task-routing';
import { callAI } from '@/ai-model/service-caller';
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

describe('Jev task routing', () => {
  const configs = {
    getModelConfig: (intent: IModelConfig['intent']) =>
      intent === 'default'
        ? defaultConfig
        : { ...jevConfig, intent, slot: intent },
  };
  it.each(['boolean', 'locate', 'planning'] as const)(
    'keeps supported %s tasks on Jev',
    (task) => {
      expect(
        resolveModelForTask(
          configs,
          task === 'boolean' ? 'insight' : task,
          task,
        ).config.modelFamily,
      ).toBe('jev');
    },
  );
  it.each(['extract', 'text'] as const)(
    'routes unsupported %s before requesting',
    (task) => {
      const runtime = resolveModelForTask(configs, 'insight', task);
      expect(runtime.config).toMatchObject({
        modelName: 'default-model',
        slot: 'default',
        intent: 'insight',
      });
      expect(runtime.modelRouting).toMatchObject({
        requestedModel: 'jev-1.14.0',
        task,
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
    const resolve = rs.fn((task) =>
      resolveModelForTask(configs, 'insight', task),
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
    expect(resolve.mock.calls.map(([task]) => task)).toEqual([
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
    expect(result.parseResult.element?.center).toEqual([400, 150]);
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
    expect(body.assets[body.state.screenshot].format).toBe('jpg');
    expect(runtime.onUsage).toHaveBeenCalledTimes(1);
    expect(runtime.onRequest).toHaveBeenCalledTimes(1);
    expect(result.usage).toMatchObject({
      api_protocol: 'system-one',
      stream: false,
      total_tokens: 120,
      slot: 'locate',
    });
    expect(recording.events.map((event) => event.type)).toEqual([
      'request',
      'response',
    ]);
    expect(recording.events[0]).toMatchObject({
      slot: 'locate',
      intent: 'locate',
    });
    expect(JSON.stringify(recording.events)).not.toContain('test-key');
  });
  it('preserves the OpenRouter System One image format', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response());
    await AiLocateElement({
      context: await context(500, 400),
      targetElementDescription: 'button',
      modelRuntime: getModelRuntime({
        ...jevConfig,
        openaiBaseURL: 'https://openrouter.ai/api/v1',
      }),
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/systemone',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.assets).toBeUndefined();
    expect(body.state.screenshot.type).toBe('image_url');
    expect(body.state.screenshot.image_url.url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });
  it('undoes minimum-size padding and rejects clicks in padding', async () => {
    const prepared = await prepareJevImage(await image(100, 50));
    expect([prepared.width, prepared.height]).toEqual([280, 280]);
    const result = mapJevBox(
      { left: 0, top: 0, right: 100 / 280, bottom: 50 / 280 },
      prepared,
      { width: 100, height: 50 },
    );
    expect(result.center).toEqual([50, 25]);
    expect(() =>
      mapJevBox({ left: 0.8, top: 0.8, right: 1, bottom: 1 }, prepared, {
        width: 100,
        height: 50,
      }),
    ).toThrow('padding');
  });
  it('keeps extremely narrow images inside Jev limits', async () => {
    const prepared = await prepareJevImage(await image(3000, 30));
    expect([prepared.width, prepared.height]).toEqual([1568, 280]);
    expect(prepared.contentSize.height).toBe(16);
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
    const runtime = resolveModelForTask(configs, 'insight', 'extract');
    const result = await AiExtractElementInfo({
      dataQuery: 'extract text',
      context: await context(),
      modelRuntime: runtime,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.usage).toMatchObject({
      slot: 'default',
      model_name: 'default-model',
      modelRouting: {
        requestedSlot: 'insight',
        requestedModel: 'jev-1.14.0',
        task: 'extract',
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
      callAI([], getModelRuntime({ ...jevConfig, timeout: 10 }), {
        systemOneRequest: {
          state: {},
          questions: { result: { type: 'noul', instructions: 'true' } },
        },
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('honors cancellation without making a request', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();
    await expect(
      callAI([], getModelRuntime(jevConfig), {
        abortSignal: controller.signal,
        systemOneRequest: {
          state: {},
          questions: { result: { type: 'noul', instructions: 'true' } },
        },
      }),
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
  const planningResponse = (action: string, direction = 'down') =>
    new Response(
      JSON.stringify({
        answers: {
          action: { type: 'choice', choice: action },
          direction: { type: 'choice', choice: direction },
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
      locateModelRuntime: getModelRuntime(jevConfig),
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
  it.each(['Tap', 'Scroll', 'Sleep', 'Complete'])(
    'plans %s without a general model',
    async (action) => {
      const fetchMock = rs
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => planningResponse(action, 'left'));
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
      if (action === 'Tap' || action === 'Scroll') {
        expect(result.actions?.[0]?.param.locate.prompt).toContain(
          'Previous tap succeeded',
        );
        expect(result.actions?.[0]?.param.locate.bbox).toBeUndefined();
      }
      if (action === 'Scroll') {
        expect(result.actions?.[0]?.param.direction).toBe('left');
      }
      expect(opts.conversationHistory.pendingFeedbackMessage).toBe('');
      expect(result.usage?.slot).toBe('planning');
    },
  );
  it.each(['Delegate', 'Tap'])(
    'delegates %s with the same goal and history',
    async (action) => {
      rs.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        planningResponse(action),
      );
      const opts = await options();
      const fallback = rs.fn(async () => ({
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
      const result = await jevPlan(instruction, {
        ...opts,
        locateModelRuntime: base,
        getDefaultModelRuntime,
      });
      expect(result.log).toBe('default planning');
      expect(fallback).toHaveBeenCalledWith(
        instruction,
        expect.objectContaining({
          conversationHistory: opts.conversationHistory,
          includeLocateInPlanning: false,
          modelRuntime: expect.objectContaining({
            config: expect.objectContaining({
              slot: 'default',
              intent: 'planning',
            }),
            modelRouting: expect.objectContaining({ task: 'planning' }),
          }),
        }),
      );
      expect(opts.conversationHistory.pendingFeedbackMessage).toBe(
        'Input is empty',
      );
    },
  );
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
