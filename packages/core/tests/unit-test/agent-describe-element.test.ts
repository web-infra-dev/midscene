import { Agent } from '@/agent';
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

describe('Agent describeElementAtPoint', () => {
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
    const verifyLocator = vi
      .spyOn(agent, 'verifyLocator')
      .mockRejectedValue(new Error('should not verify locator'));

    const result = await agent.describeElementAtPoint([10, 20], {
      verifyPrompt: false,
    });

    expect(result).toEqual({
      prompt: 'LocalSearch title',
      deepLocate: false,
      verifyResult: undefined,
    });
    expect(verifyLocator).not.toHaveBeenCalled();

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
    const verifyResult = {
      pass: true,
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
      centerDistance: 10,
    };
    const verifyLocator = vi
      .spyOn(agent, 'verifyLocator')
      .mockResolvedValue(verifyResult);

    const result = await agent.describeElementAtPoint([10, 20]);

    expect(result.verifyResult).toBe(verifyResult);
    expect(verifyLocator).toHaveBeenCalledWith(
      'LocalSearch title',
      undefined,
      [10, 20],
      undefined,
    );

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
    const verifyResult = {
      pass: true,
      rect: { left: 0, top: 0, width: 1, height: 1 },
      center: [0.5, 0.5] as [number, number],
      centerDistance: 0,
    };
    const verifyLocator = vi
      .spyOn(agent, 'verifyLocator')
      .mockResolvedValue(verifyResult);

    const result = await agent.describeElementAtPoint([0.5, 0.5], {
      deepLocate: true,
      screenshotBase64: fixtureScreenshot,
      coordinateSpace: 'screenshot',
    });

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
    expect(verifyLocator).toHaveBeenCalledWith(
      'Screenshot target',
      {
        uiContext: expect.objectContaining({
          shotSize: fixtureScreenshotSize,
        }),
      },
      [0.5, 0.5],
      expect.objectContaining({
        deepLocate: true,
        screenshotBase64: fixtureScreenshot,
        coordinateSpace: 'screenshot',
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
    vi.spyOn(agent, 'verifyLocator').mockResolvedValue({
      pass: true,
      rect: { left: 0, top: 0, width: 1, height: 1 },
      center: [0.5, 0.5] as [number, number],
      centerDistance: 0,
    });

    await agent.describeElementAtPoint([0.5, 0.5], {
      screenshotBase64: rawScreenshotBody,
      coordinateSpace: 'screenshot',
    });

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

  it('maps logical coordinates into screenshot coordinates', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'Mapped target',
    });
    vi.spyOn(agent, 'verifyLocator').mockResolvedValue({
      pass: true,
      rect: { left: 0, top: 0, width: 1, height: 1 },
      center: [0.5, 0.5] as [number, number],
      centerDistance: 0,
    });

    await agent.describeElementAtPoint([50, 25], {
      screenshotBase64: fixtureScreenshot,
      coordinateSpace: 'logical',
      logicalSize: { width: 100, height: 50 },
    });

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

  it('requires logicalSize when screenshot context uses logical coordinates', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const describe = vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'should not run',
    });

    await expect(
      agent.describeElementAtPoint([50, 25], {
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

    await agent.describeElementAtPoint([50, 50], {
      verifyPrompt: false,
      screenshotBase64: fixtureScreenshot,
      screenshotSize: { width: 100, height: 100 },
      coordinateSpace: 'logical',
      logicalSize: { width: 100, height: 100 },
    });

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
});
