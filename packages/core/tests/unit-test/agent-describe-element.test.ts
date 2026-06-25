import { Agent } from '@/agent';
import { getModelRuntime } from '@/ai-model';
import { callAIWithObjectResponse } from '@/ai-model/service-caller';
import {
  type ElementDescriberRuntime,
  describeElementAtPoint,
  verifyElementByServiceLocate,
  verifyElementDescriptionAtPoint,
  verifyLocator,
} from '@/element-describer';
import { ScreenshotItem } from '@/screenshot-item';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { localImg2Base64 } from '@midscene/shared/img';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFixture } from '../utils';

const {
  mockCompositeElementInfoImg,
  mockCompositePointMarkerImg,
  mockCropByRect,
} = vi.hoisted(() => ({
  mockCompositeElementInfoImg: vi.fn(),
  mockCompositePointMarkerImg: vi.fn(),
  mockCropByRect: vi.fn(),
}));

vi.mock('@/ai-model/service-caller', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/ai-model/service-caller')>();
  return {
    ...original,
    callAIWithObjectResponse: vi.fn(),
  };
});

vi.mock('@midscene/shared/img', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@midscene/shared/img')>();
  return {
    ...original,
    compositeElementInfoImg: mockCompositeElementInfoImg,
    compositePointMarkerImg: mockCompositePointMarkerImg,
    cropByRect: mockCropByRect,
  };
});

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'test-model',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
};

const fixtureScreenshot = localImg2Base64(getFixture('baidu.png'));
const fixtureScreenshotSize = { width: 3282, height: 1442 };

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
    describe: () => 'test page',
    size: async () => ({ width: 1280, height: 720 }),
    screenshotBase64: async () => fixtureScreenshot,
  } as any;
}

function createElementDescriberRuntime(agent: Agent): ElementDescriberRuntime {
  return {
    service: agent.service,
    describeModelRuntime: getModelRuntime(
      agent.modelConfigManager.getModelConfig('insight'),
    ),
    locateModelRuntime: getModelRuntime(
      agent.modelConfigManager.getModelConfig('default'),
    ),
  };
}

function mockServiceLocate(
  agent: Agent,
  element: {
    rect: { left: number; top: number; width: number; height: number };
    center: [number, number];
    description?: string;
  },
) {
  return vi.spyOn(agent.service, 'locate').mockResolvedValue({
    element: {
      ...element,
      description: element.description || 'mock element',
    },
    rect: element.rect,
    dump: {} as any,
  });
}

describe('element describer utils', () => {
  beforeEach(() => {
    mockCompositeElementInfoImg.mockReset();
    mockCompositeElementInfoImg.mockResolvedValue(
      'data:image/png;base64,diagnostic-rect',
    );
    mockCompositePointMarkerImg.mockReset();
    mockCompositePointMarkerImg.mockImplementation(async (options) =>
      options.indexId === 2
        ? 'data:image/png;base64,diagnostic-point-2'
        : 'data:image/png;base64,diagnostic-point-1',
    );
    mockCropByRect.mockReset();
    mockCropByRect.mockResolvedValue({
      width: 128,
      height: 128,
      imageBase64: 'data:image/png;base64,diagnostic-crop',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(callAIWithObjectResponse).mockReset();
  });

  it('skips locator verification when verifyPrompt is false', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'LocalSearch title',
    });
    const locate = vi
      .spyOn(agent.service, 'locate')
      .mockRejectedValue(new Error('should not verify locator'));

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 20],
      {
        verifyPrompt: false,
      },
    );

    expect(result).toMatchObject({
      prompt: 'LocalSearch title',
      deepLocate: false,
      retryStrategy: 'none',
      success: true,
    });
    expect(result.verifyResult).toBeUndefined();
    expect(locate).not.toHaveBeenCalled();

    await agent.destroy();
  });

  it('keeps locator verification enabled by default', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      target: 'LocalSearch title text',
      primitive: 'text',
      owner: 'LocalSearch page',
      description: 'LocalSearch title',
    });
    const locate = mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 20],
    );

    expect(result.verifyResult).toEqual({
      pass: true,
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10],
      centerDistance: 10,
      includedInRect: true,
    });
    expect(locate).toHaveBeenCalledWith(
      {
        prompt: expect.stringContaining(
          'Locate the tightest bounding box for the exact target described below.',
        ),
        cacheable: true,
        deepLocate: false,
        xpath: undefined,
      },
      {},
      expect.any(Object),
      undefined,
    );
    expect(locate.mock.calls[0][0].prompt).toContain(
      'final locator description: LocalSearch title',
    );
    expect(locate.mock.calls[0][0].prompt).toContain('target primitive: text');
    expect(result).toEqual(
      expect.objectContaining({
        target: 'LocalSearch title text',
        primitive: 'text',
        owner: 'LocalSearch page',
      }),
    );

    await agent.destroy();
  });

  it('uses structured descriptor fields in locate prompt by default', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      target: 'right arrow icon',
      primitive: 'arrow',
      owner: 'Close Time column header',
      disambiguator: 'lower half',
      context: 'sort control in table header',
      description: 'Lower arrow in the Close Time sort control',
    });
    const locate = mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 20],
    );

    expect(locate.mock.calls[0][0].prompt).toContain('target primitive: arrow');
    expect(locate.mock.calls[0][0].prompt).toContain(
      'target itself: right arrow icon',
    );
    expect(locate.mock.calls[0][0].prompt).toContain(
      'owner/context: Close Time column header',
    );
    expect(locate.mock.calls[0][0].prompt).toContain(
      'final locator description: Lower arrow in the Close Time sort control',
    );

    await agent.destroy();
  });

  it('keeps dropdown primitive distinct from input and trailing icons in locate prompt', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      target: 'Demand FCST Version dropdown current value',
      primitive: 'dropdown',
      owner: '* Demand FCST Version filter',
      disambiguator: 'currently showing DF20250918_V002',
      description: '* Demand FCST Version dropdown showing DF20250918_V002',
    });
    const locate = mockServiceLocate(agent, {
      rect: { left: 80, top: 40, width: 120, height: 24 },
      center: [140, 52] as [number, number],
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [140, 52],
    );

    expect(locate.mock.calls[0][0].prompt).toContain(
      'target primitive: dropdown',
    );
    expect(locate.mock.calls[0][0].prompt).toContain(
      'Treat select/combobox controls as dropdown',
    );
    expect(locate.mock.calls[0][0].prompt).toContain(
      'Do not retarget to a trailing search, clear, or arrow icon',
    );

    await agent.destroy();
  });

  it('passes by default when the located rect contains the target point without retrying', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Broad row container',
    });
    mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 100, height: 100 },
      center: [50, 50] as [number, number],
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 10],
      {
        retryLimit: 2,
      },
    );

    expect(result).toMatchObject({
      prompt: 'Broad row container',
      deepLocate: false,
      retryStrategy: 'none',
      verifyResult: {
        pass: true,
        rect: { left: 0, top: 0, width: 100, height: 100 },
        center: [50, 50],
        centerDistance: 57,
        includedInRect: true,
      },
      success: true,
    });
    expect(describe).toHaveBeenCalledTimes(1);

    await agent.destroy();
  });

  it('returns the generated prompt when locator verification throws', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Missing target',
    });
    vi.spyOn(agent.service, 'locate').mockRejectedValue(
      new Error('failed to locate element'),
    );

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 20],
      {
        retryLimit: 1,
      },
    );

    expect(result).toMatchObject({
      prompt: 'Missing target',
      deepLocate: false,
      retryStrategy: 'none',
      success: false,
      error: 'failed to locate element',
      failureStage: 'verify',
    });
    expect(result.verifyResult).toBeUndefined();

    await agent.destroy();
  });

  it('uses screenshot context without scaling screenshot-space coordinates and honors explicit deepLocate', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Screenshot target',
    });
    const locate = mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 1, height: 1 },
      center: [0.5, 0.5] as [number, number],
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [0.5, 0.5],
      {
        deepLocate: true,
        screenshotBase64: fixtureScreenshot,
        coordinateSpace: 'screenshot',
      },
    );

    expect(result.prompt).toBe('Screenshot target');
    expect(describe).toHaveBeenCalledWith(
      [0.5, 0.5],
      expect.any(Object),
      expect.objectContaining({
        deepLocate: true,
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
          shrunkShotToLogicalRatio: 1,
          _isFrozen: true,
        }),
      }),
    );
    expect(locate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Target: Screenshot target'),
      }),
      {
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
        }),
      },
      expect.any(Object),
      undefined,
    );

    await agent.destroy();
  });

  it('enables deepLocate on the first retry after verifier failure', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'Broad target',
      })
      .mockResolvedValueOnce({
        description: 'Precise target',
      });
    mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 100, height: 100 },
      center: [50, 50] as [number, number],
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 10],
      {
        retryLimit: 2,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Precise target',
        }),
      },
    );

    expect(result.prompt).toBe('Precise target');
    expect(result.deepLocate).toBe(true);
    expect(describe).toHaveBeenCalledTimes(2);
    expect(describe.mock.calls[0][2]).toEqual(
      expect.objectContaining({ deepLocate: false }),
    );
    expect(describe.mock.calls[1][2]).toEqual(
      expect.objectContaining({ deepLocate: true }),
    );

    await agent.destroy();
  });

  it('passes mapped targetRect into describe when screenshot context uses logical coordinates', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Mapped rect target',
    });
    mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 1, height: 1 },
      center: [0.5, 0.5] as [number, number],
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [50, 25],
      {
        screenshotBase64: fixtureScreenshot,
        coordinateSpace: 'logical',
        logicalSize: { width: 100, height: 50 },
        targetRect: { left: 40, top: 10, width: 20, height: 30 },
      },
    );

    expect(describe).toHaveBeenCalledWith(
      {
        left: (40 * fixtureScreenshotSize.width) / 100,
        top: (10 * fixtureScreenshotSize.height) / 50,
        width: (20 * fixtureScreenshotSize.width) / 100,
        height: (30 * fixtureScreenshotSize.height) / 50,
      },
      expect.any(Object),
      expect.objectContaining({
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
        }),
      }),
    );

    await agent.destroy();
  });

  it('normalizes raw screenshot base64 into a data URL context', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const rawScreenshotBody = fixtureScreenshot.replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      '',
    );
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Screenshot target',
    });
    mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 1, height: 1 },
      center: [0.5, 0.5] as [number, number],
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [0.5, 0.5],
      {
        screenshotBase64: rawScreenshotBody,
        coordinateSpace: 'screenshot',
      },
    );

    const describeContext = describe.mock.calls[0][2]?.context;
    expect(describeContext?.screenshot.base64).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(describeContext?.shotSize).toEqual(fixtureScreenshotSize);

    await agent.destroy();
  });

  it('passes uiContext override into aiLocate execution', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const uiContext = {
      screenshot: ScreenshotItem.create(fixtureScreenshot, Date.now()),
      shotSize: fixtureScreenshotSize,
      shrunkShotToLogicalRatio: 1,
      _isFrozen: true,
    };
    const runPlans = vi
      .spyOn(agent.taskExecutor, 'runPlans')
      .mockResolvedValue({
        output: {
          element: {
            rect: { left: 1, top: 2, width: 3, height: 4 },
            center: [2.5, 4] as [number, number],
          },
        },
        runner: {} as any,
      });

    const result = await agent.aiLocate('Screenshot target', {
      uiContext,
    });

    expect(result).toEqual({
      rect: { left: 1, top: 2, width: 3, height: 4 },
      center: [2.5, 4],
      dpr: undefined,
    });
    expect(runPlans).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      expect.any(Object),
      { uiContext },
    );

    await agent.destroy();
  });

  it('keeps locator verification strict when the expected point is outside the located rect', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 10, height: 10 },
      center: [5, 5] as [number, number],
    });

    const result = await verifyLocator(
      createElementDescriberRuntime(agent),
      'input text area',
      undefined,
      [15, 5],
      {
        centerDistanceThreshold: 1,
      },
    );

    expect(result).toEqual({
      pass: false,
      rect: { left: 0, top: 0, width: 10, height: 10 },
      center: [5, 5],
      centerDistance: 10,
      includedInRect: false,
    });

    await agent.destroy();
  });

  it('allows locatorVerifyFn to override describeElementAtPoint retry pass criteria', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'First target',
      })
      .mockResolvedValueOnce({
        description: 'Second target',
      });
    mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 10],
      {
        retryLimit: 2,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Second target',
        }),
      },
    );

    expect(result.prompt).toBe('Second target');
    expect(result.verifyResult?.pass).toBe(true);
    expect(describe).toHaveBeenCalledTimes(2);

    await agent.destroy();
  });

  it('uses deep locate for verifier locate during deep describe retries', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'First target',
      })
      .mockResolvedValueOnce({
        description: 'Second target',
      });
    const locate = mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 10],
      {
        retryLimit: 2,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Second target',
        }),
      },
    );

    expect(locate).toHaveBeenCalledTimes(2);
    expect(locate.mock.calls[0][0].deepLocate).not.toBe(true);
    expect(locate.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        deepLocate: true,
      }),
    );

    await agent.destroy();
  });

  it('does not enable locator model reasoning after the first describeElementAtPoint failure', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'First target',
      })
      .mockResolvedValueOnce({
        description: 'Second target',
      });
    const locate = mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 10],
      {
        retryLimit: 2,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Second target',
        }),
      },
    );

    expect(describe).toHaveBeenCalledTimes(2);
    expect(describe.mock.calls[0][1].config.reasoningEnabled).toBeUndefined();
    expect(describe.mock.calls[1][1].config.reasoningEnabled).toBeUndefined();
    expect(locate).toHaveBeenCalledTimes(2);
    expect(locate.mock.calls[0][2].config.reasoningEnabled).toBeUndefined();
    expect(locate.mock.calls[1][2].config.reasoningEnabled).toBeUndefined();

    await agent.destroy();
  });

  it('does not pass verifier feedback into the next describe retry by default', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'Broad container',
      })
      .mockResolvedValueOnce({
        description: 'Precise target',
      });
    mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 100, height: 100 },
      center: [50, 50] as [number, number],
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 10],
      {
        retryLimit: 2,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Precise target',
        }),
      },
    );

    expect(result.prompt).toBe('Precise target');
    expect(result.retryStrategy).toBe('none');
    expect(describe).toHaveBeenCalledTimes(2);
    expect(describe.mock.calls[0][2]?.feedback).toBeUndefined();
    expect(describe.mock.calls[1][2]?.feedback).toBeUndefined();

    await agent.destroy();
  });

  it('does not call diagnostic after the final failed attempt', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Wrong target',
    });
    mockServiceLocate(agent, {
      rect: { left: 40, top: 40, width: 10, height: 10 },
      center: [45, 45] as [number, number],
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [10, 10],
      {
        retryLimit: 1,
        retryStrategy: 'diagnostic',
        locatorVerifyFn: ({ verifyResult }) => ({
          ...verifyResult,
          pass: false,
        }),
      },
    );

    expect(result.success).toBe(false);
    expect(result.retryStrategy).toBe('diagnostic');
    expect(callAIWithObjectResponse).not.toHaveBeenCalled();

    await agent.destroy();
  });

  it('can use diagnostic primitive feedback for neighbor retries', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'Nearby external link icon',
      })
      .mockResolvedValueOnce({
        description: 'Three-dot more icon in the toolbar',
      });
    const locate = mockServiceLocate(agent, {
      rect: { left: 40, top: 40, width: 10, height: 10 },
      center: [45, 45] as [number, number],
    });
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        failureType: 'neighbor-or-similar-element',
        confidence: 0.9,
        centerPrimitive: 'icon',
        glyph: 'three-dot',
        isPrimitiveConsistentWithContext: true,
        wrongMatchSummary: 'the previous locate matched an external-link icon',
        describeInstruction:
          'Describe the three-dot icon itself and use nearby toolbar text only as context.',
        locateInstruction:
          'Locate the three-dot icon in the toolbar beside the more actions control.',
      },
      contentString: '{}',
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [100, 100],
      {
        retryLimit: 2,
        retryStrategy: 'diagnostic',
        screenshotBase64: fixtureScreenshot,
        screenshotSize: fixtureScreenshotSize,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Three-dot more icon in the toolbar',
        }),
      },
    );

    expect(result.prompt).toBe('Three-dot more icon in the toolbar');
    expect(result.retryStrategy).toBe('diagnostic');
    expect(result.visualDiagnostic).toEqual(
      expect.objectContaining({
        failureType: 'neighbor-or-similar-element',
        confidence: 0.9,
        centerPrimitive: 'icon',
        glyph: 'three-dot',
        isPrimitiveConsistentWithContext: true,
      }),
    );
    expect(callAIWithObjectResponse).toHaveBeenCalledTimes(1);
    expect(mockCompositeElementInfoImg).not.toHaveBeenCalled();
    expect(mockCompositePointMarkerImg).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        point: { x: 100, y: 100 },
        indexId: 1,
      }),
    );
    expect(mockCompositePointMarkerImg).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        point: { x: 45, y: 45 },
        indexId: 2,
      }),
    );
    expect(
      vi.mocked(callAIWithObjectResponse).mock.calls[0][0][1].content,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image_url' }),
        expect.objectContaining({ type: 'image_url' }),
      ]),
    );
    const diagnosticText = (
      vi.mocked(callAIWithObjectResponse).mock.calls[0][0][1].content as Array<{
        type: string;
        text?: string;
      }>
    )
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
    expect(diagnosticText).toContain('Marker 1 = target endpoint');
    expect(diagnosticText).toContain('Marker 2 = previous locator result');
    expect(diagnosticText).toContain(
      'treat marker 2 as wrong, biased, too broad, or insufficient relative to marker 1',
    );
    expect(describe).toHaveBeenCalledTimes(2);
    expect(describe.mock.calls[1][2]?.feedback).toContain(
      'A visual diagnostic inspected the callout endpoint crop.',
    );
    expect(describe.mock.calls[1][2]?.feedback).toContain('three-dot icon');
    expect(describe.mock.calls[1][2]?.feedback).toContain(
      'Nearby text, icons, rows, or controls are context only',
    );
    expect(describe.mock.calls[1][2]?.feedback).toContain(
      'Locator-oriented constraint: Locate the three-dot icon in the toolbar beside the more actions control.',
    );
    expect(locate).toHaveBeenCalledTimes(2);
    expect(locate.mock.calls[1][0].prompt).toContain(
      'Diagnostic locator constraint: Locate the three-dot icon in the toolbar beside the more actions control.',
    );
    expect(describe.mock.calls[1][2]?.feedback).toContain(
      'Do not mention diagnostic marker numbers, marker colors',
    );
    expect(describe.mock.calls[1][2]?.feedback).not.toContain(
      'external-link icon',
    );

    await agent.destroy();
  });

  it('uses an explicit targetRect as diagnostic marker 1 only when provided', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'Nearby icon',
      })
      .mockResolvedValueOnce({
        description: 'Target icon',
      });
    mockServiceLocate(agent, {
      rect: { left: 40, top: 40, width: 10, height: 10 },
      center: [45, 45] as [number, number],
    });
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        failureType: 'neighbor-or-similar-element',
        confidence: 0.9,
        centerPrimitive: 'icon',
        glyph: 'target',
        isPrimitiveConsistentWithContext: true,
        describeInstruction: 'Describe the target icon itself.',
      },
      contentString: '{}',
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [100, 100],
      {
        retryLimit: 2,
        retryStrategy: 'diagnostic',
        targetRect: { left: 80, top: 80, width: 60, height: 50 },
        screenshotBase64: fixtureScreenshot,
        screenshotSize: fixtureScreenshotSize,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Target icon',
        }),
      },
    );

    expect(describe.mock.calls[0][0]).toEqual({
      left: 80,
      top: 80,
      width: 60,
      height: 50,
    });
    expect(mockCompositeElementInfoImg).toHaveBeenCalledWith(
      expect.objectContaining({
        elementsPositionInfo: [
          {
            rect: { left: 80, top: 80, width: 60, height: 50 },
            indexId: 1,
          },
        ],
        borderThickness: 2,
      }),
    );
    expect(mockCompositePointMarkerImg).toHaveBeenCalledTimes(1);
    expect(mockCompositePointMarkerImg).toHaveBeenCalledWith(
      expect.objectContaining({
        point: { x: 45, y: 45 },
        indexId: 2,
      }),
    );

    await agent.destroy();
  });

  it('drops diagnostic instructions that describe annotation styling', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'Comment option',
      })
      .mockResolvedValueOnce({
        description: 'Approve option',
      });
    mockServiceLocate(agent, {
      rect: { left: 40, top: 40, width: 10, height: 10 },
      center: [45, 45] as [number, number],
    });
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        failureType: 'neighbor-or-similar-element',
        confidence: 0.9,
        centerPrimitive: 'control',
        isPrimitiveConsistentWithContext: true,
        describeInstruction: 'Describe the red marker 1 box around Approve.',
        locateInstruction: 'Locate the blue marker 2 dot.',
      },
      contentString: '{}',
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [100, 100],
      {
        retryLimit: 2,
        retryStrategy: 'diagnostic',
        screenshotBase64: fixtureScreenshot,
        screenshotSize: fixtureScreenshotSize,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Approve option',
        }),
      },
    );

    expect(describe).toHaveBeenCalledTimes(2);
    expect(describe.mock.calls[1][2]?.feedback).toContain(
      'The endpoint appears to be control.',
    );
    expect(describe.mock.calls[1][2]?.feedback).not.toContain('red marker');
    expect(describe.mock.calls[1][2]?.feedback).not.toContain('blue marker');

    await agent.destroy();
  });

  it('records uncertain diagnostic output without applying feedback', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'Nearby icon',
      })
      .mockResolvedValueOnce({
        description: 'Default retry description',
      });
    mockServiceLocate(agent, {
      rect: { left: 40, top: 40, width: 10, height: 10 },
      center: [45, 45] as [number, number],
    });
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        failureType: 'unknown',
        confidence: 0.4,
        centerPrimitive: 'unknown',
        isPrimitiveConsistentWithContext: false,
        uncertaintyReason: 'center crop and full screenshot context conflict',
      },
      contentString: '{}',
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [100, 100],
      {
        retryLimit: 2,
        retryStrategy: 'diagnostic',
        screenshotBase64: fixtureScreenshot,
        screenshotSize: fixtureScreenshotSize,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Default retry description',
        }),
      },
    );

    expect(result.prompt).toBe('Default retry description');
    expect(result.visualDiagnostic).toEqual(
      expect.objectContaining({
        failureType: 'unknown',
        confidence: 0.4,
        isPrimitiveConsistentWithContext: false,
      }),
    );
    expect(describe).toHaveBeenCalledTimes(2);
    expect(describe.mock.calls[1][2]?.feedback).toBeUndefined();

    await agent.destroy();
  });

  it('applies visual diagnostic feedback for table/list context mismatches', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi
      .spyOn(agent.service, 'describe')
      .mockResolvedValueOnce({
        description: 'Completed status',
      })
      .mockResolvedValueOnce({
        description: 'Completed status in the target row',
      });
    mockServiceLocate(agent, {
      rect: { left: 40, top: 40, width: 10, height: 10 },
      center: [45, 45] as [number, number],
    });
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        failureType: 'table-context-mismatch',
        confidence: 0.9,
        centerPrimitive: 'status',
        describeInstruction:
          'Use same-row anchors, but do not change the target primitive.',
      },
      contentString: '{}',
    });

    const result = await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [100, 100],
      {
        retryLimit: 2,
        retryStrategy: 'diagnostic',
        screenshotBase64: fixtureScreenshot,
        screenshotSize: fixtureScreenshotSize,
        locatorVerifyFn: ({ prompt, verifyResult }) => ({
          ...verifyResult,
          pass: prompt === 'Completed status in the target row',
        }),
      },
    );

    expect(result.prompt).toBe('Completed status in the target row');
    expect(result.visualDiagnostic).toEqual(
      expect.objectContaining({
        failureType: 'table-context-mismatch',
        confidence: 0.9,
      }),
    );
    expect(describe).toHaveBeenCalledTimes(2);
    expect(describe.mock.calls[1][2]?.feedback).toContain(
      'wrong repeated context',
    );
    expect(describe.mock.calls[1][2]?.feedback).toContain(
      'Use same-row anchors, but do not change the target primitive.',
    );

    await agent.destroy();
  });

  it('maps logical coordinates into screenshot coordinates', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Mapped target',
    });
    const locate = mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 1, height: 1 },
      center: [0.5, 0.5] as [number, number],
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [50, 25],
      {
        screenshotBase64: fixtureScreenshot,
        coordinateSpace: 'logical',
        logicalSize: { width: 100, height: 50 },
      },
    );

    expect(describe).toHaveBeenCalledWith(
      [1641, 721],
      expect.any(Object),
      expect.objectContaining({
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
        }),
      }),
    );
    expect(locate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Target: Mapped target'),
      }),
      {
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
        }),
      },
      expect.any(Object),
      undefined,
    );

    await agent.destroy();
  });

  it('requires logicalSize when screenshot context uses logical coordinates', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'should not run',
    });

    await expect(
      describeElementAtPoint(createElementDescriberRuntime(agent), [50, 25], {
        screenshotBase64: fixtureScreenshot,
        coordinateSpace: 'logical',
      }),
    ).rejects.toThrow(
      'logicalSize is required when coordinateSpace is logical',
    );
    expect(describe).not.toHaveBeenCalled();

    await agent.destroy();
  });

  it('uses parsed screenshot size when provided screenshotSize differs', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Actual-size target',
    });

    await describeElementAtPoint(
      createElementDescriberRuntime(agent),
      [50, 50],
      {
        verifyPrompt: false,
        screenshotBase64: fixtureScreenshot,
        screenshotSize: { width: 100, height: 100 },
        coordinateSpace: 'logical',
        logicalSize: { width: 100, height: 100 },
      },
    );

    expect(describe).toHaveBeenCalledWith(
      [1641, 721],
      expect.any(Object),
      expect.objectContaining({
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
        }),
      }),
    );

    await agent.destroy();
  });

  it('verifies an explicit element description without a screenshot context', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const locate = mockServiceLocate(agent, {
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
    });

    const result = await verifyElementDescriptionAtPoint(
      createElementDescriberRuntime(agent),
      'Submit button',
      [10, 10],
      { centerDistanceThreshold: 12 },
    );

    expect(result).toEqual({
      pass: true,
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10],
      centerDistance: 0,
      includedInRect: true,
    });
    expect(locate).toHaveBeenCalledWith(
      {
        prompt: 'Submit button',
        cacheable: true,
        deepLocate: false,
        xpath: undefined,
      },
      {},
      expect.any(Object),
      undefined,
    );

    await agent.destroy();
  });

  it('verifies an explicit element description through Service.locate', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const locate = vi.spyOn(agent.service, 'locate').mockResolvedValue({
      element: {
        rect: { left: 0, top: 0, width: 20, height: 20 },
        center: [10, 10] as [number, number],
        description: 'Submit button',
      },
      rect: { left: 0, top: 0, width: 20, height: 20 },
      dump: {} as any,
    });

    const result = await verifyElementByServiceLocate(
      createElementDescriberRuntime(agent),
      'Submit button',
      [10, 10],
      { centerDistanceThreshold: 12, deepLocate: true },
    );

    expect(result).toEqual({
      pass: true,
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10],
      centerDistance: 0,
      includedInRect: true,
    });
    expect(locate).toHaveBeenCalledWith(
      {
        prompt: 'Submit button',
        cacheable: true,
        deepLocate: true,
        xpath: undefined,
      },
      {},
      expect.any(Object),
      undefined,
    );

    await agent.destroy();
  });

  it('verifies an explicit element description against a provided screenshot', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const locate = mockServiceLocate(agent, {
      rect: { left: 1600, top: 700, width: 20, height: 20 },
      center: [1641, 721] as [number, number],
    });

    const result = await verifyElementDescriptionAtPoint(
      createElementDescriberRuntime(agent),
      'Mapped submit button',
      [50, 25],
      {
        screenshotBase64: fixtureScreenshot,
        coordinateSpace: 'logical',
        logicalSize: { width: 100, height: 50 },
        centerDistanceThreshold: 8,
      },
    );

    expect(result).toEqual({
      pass: true,
      rect: { left: 1600, top: 700, width: 20, height: 20 },
      center: [1641, 721],
      centerDistance: 0,
      includedInRect: false,
    });
    expect(locate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Mapped submit button',
      }),
      {
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
          shrunkShotToLogicalRatio: 1,
          _isFrozen: true,
        }),
      },
      expect.any(Object),
      undefined,
    );

    await agent.destroy();
  });

  it('passes screenshot context into Service.locate verification', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const locate = vi.spyOn(agent.service, 'locate').mockResolvedValue({
      element: {
        rect: { left: 1600, top: 700, width: 20, height: 20 },
        center: [1641, 721] as [number, number],
        description: 'Mapped submit button',
      },
      rect: { left: 1600, top: 700, width: 20, height: 20 },
      dump: {} as any,
    });

    const result = await verifyElementByServiceLocate(
      createElementDescriberRuntime(agent),
      'Mapped submit button',
      [50, 25],
      {
        screenshotBase64: fixtureScreenshot,
        coordinateSpace: 'logical',
        logicalSize: { width: 100, height: 50 },
        centerDistanceThreshold: 8,
      },
    );

    expect(result).toEqual({
      pass: true,
      rect: { left: 1600, top: 700, width: 20, height: 20 },
      center: [1641, 721],
      centerDistance: 0,
      includedInRect: false,
    });
    expect(locate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Mapped submit button',
      }),
      {
        context: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
          shrunkShotToLogicalRatio: 1,
          _isFrozen: true,
        }),
      },
      expect.any(Object),
      undefined,
    );

    await agent.destroy();
  });

  it('rejects empty explicit element descriptions before verifying', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const locate = vi
      .spyOn(agent.service, 'locate')
      .mockRejectedValue(new Error('should not verify locator'));

    await expect(
      verifyElementDescriptionAtPoint(
        createElementDescriberRuntime(agent),
        '   ',
        [10, 10],
      ),
    ).rejects.toThrow('description must not be empty');
    expect(locate).not.toHaveBeenCalled();

    await agent.destroy();
  });
});
