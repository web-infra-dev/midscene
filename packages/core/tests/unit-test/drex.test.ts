import { runConnectivityTest } from '@/ai-model/connectivity';
import { getModelRuntime } from '@/ai-model/models';
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

const recording = rs.hoisted(() => ({ events: [] as Record<string, any>[] }));
rs.mock('@/ai-model/service-caller/model-call-recorder', () => ({
  isModelCallRecordingEnabled: () => true,
  recordModelCallEvent: (event: Record<string, any>) => {
    recording.events.push(event);
  },
}));

const drexConfig: IModelConfig = {
  modelName: 'drex-max',
  modelFamily: 'drex',
  modelDescription: 'drex mode',
  intent: 'planning',
  slot: 'planning',
  openaiBaseURL: 'https://console.nace.ai/v1',
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

// Response shapes recorded from POST https://console.nace.ai/v1/systemone with
// model drex-max. Drex adds confidence, probabilities, evaluation_time_ms and
// request_id, which Midscene must tolerate.
const recordedNoul = {
  model: 'drex-max',
  answers: { result: { type: 'noul', noul: 0.9983 } },
  usage: { input_tokens: 307, output_tokens: 311 },
  evaluation_time_ms: 180.8,
  request_id: 'req_recorded_noul',
};
const recordedChoice = (choice: string) => ({
  model: 'drex-max',
  answers: {
    action: {
      type: 'choice',
      choice,
      confidence: 0.9987,
      probabilities: { [choice]: 0.9991, 'control:complete': 0.0007 },
    },
  },
  usage: { input_tokens: 412, output_tokens: 118 },
  evaluation_time_ms: 201.3,
  request_id: 'req_recorded_choice',
});
const response = (data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status: 200 });
async function image(width: number, height: number, format = 'png') {
  const pipeline = sharp({
    create: { width, height, channels: 3, background: 'white' },
  });
  const bytes = await (format === 'jpeg'
    ? pipeline.jpeg()
    : pipeline.png()
  ).toBuffer();
  return `data:image/${format};base64,${bytes.toString('base64')}`;
}
async function context(width = 2000, height = 1000): Promise<UIContext> {
  return {
    screenshot: ScreenshotItem.create(await image(width, height), Date.now()),
    shotSize: { width, height },
    shrunkShotToLogicalRatio: 1,
  };
}
const noulQuestion = {
  result: { type: 'noul' as const, instructions: 'Is `statement` true?' },
};

beforeEach(() => {
  recording.events.length = 0;
});
afterEach(() => {
  rs.restoreAllMocks();
});

describe('Drex model fallback', () => {
  const configs = {
    getModelConfig: (intent: IModelConfig['intent']) =>
      intent === 'default'
        ? defaultConfig
        : { ...drexConfig, intent, slot: intent },
  };
  it.each(['boolean', 'planning'] as const)(
    'keeps supported %s tasks on Drex',
    (taskType) => {
      expect(
        resolveModelForTaskType(
          configs,
          taskType === 'boolean' ? 'insight' : taskType,
          taskType,
        ).config.modelFamily,
      ).toBe('drex');
    },
  );
  it.each([
    ['locate', 'locate'],
    ['extract', 'insight'],
    ['general', 'insight'],
  ] as const)(
    'routes unsupported %s to the default model',
    (taskType, intent) => {
      const runtime = resolveModelForTaskType(configs, intent, taskType);
      expect(runtime.config).toMatchObject({
        modelName: 'default-model',
        slot: 'default',
        intent,
      });
      expect(runtime.modelFallback).toMatchObject({
        requestedModel: 'drex-max',
        taskType,
        reason: `drex does not support ${taskType}; using the default model`,
      });
    },
  );
  it('rejects Drex as the default model', () => {
    const configs = new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'drex-max',
      MIDSCENE_MODEL_FAMILY: 'drex',
      MIDSCENE_MODEL_BASE_URL: 'https://console.nace.ai/v1',
      MIDSCENE_MODEL_API_KEY: 'test-key',
    });
    expect(() => configs.getModelConfig('default')).toThrow(
      'Drex cannot be the default model',
    );
  });
  it('accepts drex for the planning and insight roles', () => {
    const configs = new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'default-model',
      MIDSCENE_MODEL_FAMILY: 'qwen3',
      MIDSCENE_MODEL_BASE_URL: 'https://example.com/v1',
      MIDSCENE_MODEL_API_KEY: 'test-key',
      MIDSCENE_PLANNING_MODEL_NAME: 'drex-max',
      MIDSCENE_PLANNING_MODEL_FAMILY: 'drex',
      MIDSCENE_PLANNING_MODEL_BASE_URL: 'https://console.nace.ai/v1',
      MIDSCENE_PLANNING_MODEL_API_KEY: 'test-key',
      MIDSCENE_INSIGHT_MODEL_NAME: 'drex-max',
      MIDSCENE_INSIGHT_MODEL_FAMILY: 'drex',
      MIDSCENE_INSIGHT_MODEL_BASE_URL: 'https://console.nace.ai/v1',
      MIDSCENE_INSIGHT_MODEL_API_KEY: 'test-key',
    });
    expect(configs.getModelConfig('planning')).toMatchObject({
      modelName: 'drex-max',
      modelFamily: 'drex',
      openaiBaseURL: 'https://console.nace.ai/v1',
    });
    expect(configs.getModelConfig('insight').modelFamily).toBe('drex');
    expect(configs.getModelConfig('locate').modelFamily).toBe('qwen3');
  });
});

describe('Drex requests', () => {
  it('sends images as an ordered top-level array referenced as Image N', async () => {
    const screenshot = await image(40, 30);
    const reference = await image(20, 20, 'jpeg');
    const prepared = await prepareSystemOne(drexConfig, {
      state: { target: 'button', references: ['`reference_0`'] },
      images: { screenshot, reference_0: reference },
      questions: noulQuestion,
    });
    expect(prepared.url).toBe('https://console.nace.ai/v1/systemone');
    expect(prepared.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
      'x-midscene-version': expect.any(String),
    });
    expect(prepared.headers).not.toHaveProperty('TypeSafe-Danger-Zone-Images');
    const body = JSON.parse(prepared.body);
    expect(body.model).toBe('drex-max');
    expect(body.images).toEqual([screenshot, reference]);
    expect(body.assets).toBeUndefined();
    expect(body.state).toEqual({
      target: 'button',
      references: ['`reference_0`'],
      screenshot: 'Image 1',
      reference_0: 'Image 2',
    });
    expect(body.questions).toEqual(noulQuestion);
  });
  it('accepts an endpoint on the origin of the base URL', async () => {
    const prepared = await prepareSystemOne(
      {
        ...drexConfig,
        endpoint: 'https://console.nace.ai/custom/decision',
      },
      { state: {}, questions: noulQuestion },
    );
    expect(prepared.url).toBe('https://console.nace.ai/custom/decision');
    expect(prepared.headers.Authorization).toBe('Bearer test-key');
    expect(JSON.parse(prepared.body).model).toBe('drex-max');
  });
  it.each([undefined, 'https://console.nace.ai/v1'])(
    'refuses to send the key to another origin with base URL %s',
    async (openaiBaseURL) => {
      await expect(
        prepareSystemOne(
          {
            ...drexConfig,
            openaiBaseURL,
            endpoint: 'https://example.com/custom/decision',
          },
          { state: {}, questions: noulQuestion },
        ),
      ).rejects.toThrow(/Drex.*(origin|BASE_URL)/);
    },
  );
  it('accepts Drex endpoints through the planning and insight roles', () => {
    const configs = new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'default-model',
      MIDSCENE_MODEL_FAMILY: 'qwen3',
      MIDSCENE_MODEL_BASE_URL: 'https://example.com/v1',
      MIDSCENE_MODEL_API_KEY: 'test-key',
      MIDSCENE_PLANNING_MODEL_NAME: 'drex-max',
      MIDSCENE_PLANNING_MODEL_FAMILY: 'drex',
      MIDSCENE_PLANNING_MODEL_BASE_URL: 'https://console.nace.ai/v1',
      MIDSCENE_PLANNING_MODEL_ENDPOINT: 'https://console.nace.ai/v1/systemone',
      MIDSCENE_PLANNING_MODEL_API_KEY: 'test-key',
      MIDSCENE_INSIGHT_MODEL_NAME: 'drex-max',
      MIDSCENE_INSIGHT_MODEL_FAMILY: 'drex',
      MIDSCENE_INSIGHT_MODEL_BASE_URL: 'https://console.nace.ai/v1',
      MIDSCENE_INSIGHT_MODEL_ENDPOINT: 'https://console.nace.ai/v1/systemone',
      MIDSCENE_INSIGHT_MODEL_API_KEY: 'test-key',
    });
    for (const role of ['planning', 'insight'] as const) {
      expect(configs.getModelConfig(role)).toMatchObject({
        modelFamily: 'drex',
        endpoint: 'https://console.nace.ai/v1/systemone',
      });
    }
  });
  it('rejects more than 512 questions before sending', async () => {
    const questions = Object.fromEntries(
      Array.from({ length: 513 }, (_, n) => [`q${n}`, noulQuestion.result]),
    );
    await expect(
      prepareSystemOne(drexConfig, { state: {}, questions }),
    ).rejects.toThrow('Drex accepts at most 512 questions per request');
  });
  it('omits the images array for text-only requests', async () => {
    const prepared = await prepareSystemOne(drexConfig, {
      state: { statement: 'hello' },
      questions: noulQuestion,
    });
    const body = JSON.parse(prepared.body);
    expect(body).not.toHaveProperty('images');
    expect(body.state).toEqual({ statement: 'hello' });
  });
  it('rejects more than 8 images before sending', async () => {
    const png = await image(4, 4);
    await expect(
      prepareSystemOne(drexConfig, {
        state: {},
        images: Object.fromEntries(
          Array.from({ length: 9 }, (_, index) => [`frame_${index}`, png]),
        ),
        questions: noulQuestion,
      }),
    ).rejects.toThrow('Drex accepts at most 8 images per request');
  });
  it('rejects box questions before sending', async () => {
    await expect(
      prepareSystemOne(drexConfig, {
        state: { target: 'button' },
        images: { screenshot: await image(4, 4) },
        questions: {
          target: { type: 'box', instructions: 'The target.' },
        },
      }),
    ).rejects.toThrow(/Drex does not support the box question type/);
  });
  it('applies the 4 MiB body limit', async () => {
    await expect(
      prepareSystemOne(drexConfig, {
        state: { text: 'x'.repeat(4 * 1024 * 1024) },
        questions: noulQuestion,
      }),
    ).rejects.toThrow('Drex request exceeds the 4 MiB body limit');
  });
  it('keeps the most recent frames within the 8-image budget', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response(recordedNoul));
    const runtime = {
      ...getModelRuntime({ ...drexConfig, intent: 'insight', slot: 'insight' }),
      onUsage: rs.fn(),
      onRequest: rs.fn(),
    };
    const ctx = await context(100, 80);
    const frames = Array.from({ length: 12 }, () => ctx.screenshot);
    await AiExtractElementInfo({
      taskType: 'boolean',
      dataQuery: { Boolean: 'the form is visible' },
      context: { ...ctx, screenshotSequence: frames },
      modelRuntime: runtime,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.images).toHaveLength(8);
    expect(body.state.frames).toHaveLength(8);
  });
  it('answers boolean checks from a recorded Drex response', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response(recordedNoul));
    const runtime = {
      ...getModelRuntime({ ...drexConfig, intent: 'insight', slot: 'insight' }),
      onUsage: rs.fn(),
      onRequest: rs.fn(),
    };
    const result = await AiExtractElementInfo({
      taskType: 'boolean',
      dataQuery: { Boolean: 'the form is visible' },
      context: await context(500, 400),
      modelRuntime: runtime,
    });
    expect(result.parseResult.data).toEqual({ Boolean: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://console.nace.ai/v1/systemone');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-key',
    );
    const body = JSON.parse(init?.body as string);
    expect(body.images).toHaveLength(1);
    expect(body.images[0]).toMatch(/^data:image\/png;base64,/);
    expect(body.state.frames).toEqual(['`frame_0`']);
    expect(body.state.frame_0).toBe('Image 1');
    expect(body.questions.result.type).toBe('noul');
    expect(runtime.onUsage).toHaveBeenCalledTimes(1);
    expect(result.usage).toMatchObject({
      request_kind: 'system-one',
      total_tokens: 618,
      slot: 'insight',
    });
    expect(recording.events.map((event) => event.type)).toEqual([
      'request',
      'http-response',
      'response',
    ]);
    expect(JSON.stringify(recording.events)).not.toContain('test-key');
  });
  it('preserves a false answer', async () => {
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        ...recordedNoul,
        answers: { result: { type: 'noul', noul: 0.0017 } },
      }),
    );
    const result = await AiExtractElementInfo({
      taskType: 'boolean',
      dataQuery: { Boolean: 'the form is visible' },
      context: await context(500, 400),
      modelRuntime: getModelRuntime({
        ...drexConfig,
        intent: 'insight',
        slot: 'insight',
      }),
    });
    expect(result.parseResult.data).toEqual({ Boolean: false });
  });
  it('labels request failures as Drex', async () => {
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: 'invalid_request_error',
            message: 'images: only drex-max accepts images',
            issues: [],
          },
          request_id: 'req_recorded_422',
        }),
        { status: 422 },
      ),
    );
    await expect(
      callSystemOneAI(
        { state: {}, questions: noulQuestion },
        getModelRuntime(drexConfig),
      ),
    ).rejects.toThrow(/Drex request failed \(422\)/);
    expect(recording.events.map((event) => event.type)).toEqual([
      'request',
      'http-response',
      'error',
    ]);
  });
  it('rejects streaming with a Drex label', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    await expect(
      callSystemOneAI(
        { state: {}, questions: noulQuestion },
        getModelRuntime(drexConfig),
        { stream: true, onChunk: rs.fn() },
      ),
    ).rejects.toThrow(/^Drex does not support streaming output$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails Locate fast without sending a request', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    await expect(
      AiLocateElement({
        context: await context(500, 400),
        targetElementDescription: 'button',
        modelRuntime: getModelRuntime({
          ...drexConfig,
          intent: 'locate',
          slot: 'locate',
        }),
      }),
    ).rejects.toThrow(/^Drex does not support Locate/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('connectivity tests Drex with the images array', async () => {
    const systemOneBodies: Record<string, unknown>[] = [];
    rs.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/systemone')) {
        systemOneBodies.push(JSON.parse(init?.body as string));
        return response(recordedNoul);
      }
      return new Response(
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
      );
    });
    const result = await runConnectivityTest({
      defaultModelConfig: {
        ...defaultConfig,
        openaiBaseURL: 'https://example.com/v1',
        openaiApiKey: 'test-key',
      },
      planningModelConfig: drexConfig,
      insightModelConfig: { ...drexConfig, intent: 'insight', slot: 'insight' },
    });
    // The Locate slot falls to the default model, whose aiLocate check needs a
    // model-specific locate response; only the Drex checks matter here.
    const drexChecks = result.checks.filter(
      (check) => check.modelFamily === 'drex',
    );
    expect(drexChecks.map((check) => [check.name, check.passed])).toEqual([
      ['text', true],
      ['vision', true],
    ]);
    expect(systemOneBodies).toHaveLength(2);
    for (const body of systemOneBodies) {
      expect(body.model).toBe('drex-max');
      expect(body).not.toHaveProperty('assets');
      if ('images' in body) {
        expect(Array.isArray(body.images)).toBe(true);
      }
    }
    expect(systemOneBodies.some((body) => 'images' in body)).toBe(true);
  });
});

describe('Drex planning', () => {
  async function options() {
    return {
      context: await context(),
      modelRuntime: getModelRuntime(drexConfig),
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
  it('plans a direct action from a recorded Drex choice', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response(recordedChoice('action:Tap')));
    const result = await jevPlan(
      { text: 'Submit the form', referenceImages: [] },
      await options(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.model).toBe('drex-max');
    expect(body.images).toHaveLength(1);
    expect(body.state.screenshot).toBe('Image 1');
    expect(body.state.goal).toBe('Submit the form');
    expect(Object.keys(body.questions)).toEqual(['action']);
    expect(body.questions.action.type).toBe('choice');
    expect(typeof body.questions.action.instructions).toBe('string');
    for (const value of Object.values(body.questions.action.criteria)) {
      expect(typeof value).toBe('string');
    }
    expect(Object.keys(body.questions.action.criteria)).toEqual([
      'control:complete',
      'control:delegate',
      'action:Tap',
      'delegate:Scroll',
      'delegate:Sleep',
    ]);
    expect(result.actions?.[0]?.type).toBe('Tap');
    expect(
      result.actions?.[0]?.param.locate.locatedPixelResult,
    ).toBeUndefined();
    expect(result.shouldContinuePlanning).toBe(true);
    expect(result.usage).toMatchObject({ total_tokens: 530 });
  });
  it('finishes the task from a recorded completion choice', async () => {
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(recordedChoice('control:complete')),
    );
    const result = await jevPlan(
      { text: 'Submit the form', referenceImages: [] },
      await options(),
    );
    expect(result.actions).toEqual([]);
    expect(result.finalizeSuccess).toBe(true);
  });
  it('rejects locate-in-planning before sending a box question', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    await expect(
      jevPlan(
        { text: 'Submit the form', referenceImages: [] },
        { ...(await options()), includeLocateInPlanning: true },
      ),
    ).rejects.toThrow(/Drex does not support the box question type/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
