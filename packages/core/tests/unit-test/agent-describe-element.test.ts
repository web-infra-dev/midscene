import { Agent } from '@/agent';
import { getModelRuntime } from '@/ai-model';
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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFixture } from '../utils';

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
  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(result).toEqual({
      prompt: 'LocalSearch title',
      deepLocate: false,
      verifyResult: undefined,
      success: true,
    });
    expect(locate).not.toHaveBeenCalled();

    await agent.destroy();
  });

  it('keeps locator verification enabled by default', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
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
        prompt: 'LocalSearch title',
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

    expect(result).toEqual({
      prompt: 'Missing target',
      deepLocate: false,
      verifyResult: undefined,
      success: false,
      error: 'failed to locate element',
      failureStage: 'verify',
    });

    await agent.destroy();
  });

  it('uses screenshot context without scaling screenshot-space coordinates', async () => {
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
        prompt: 'Screenshot target',
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
        prompt: 'Mapped target',
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
