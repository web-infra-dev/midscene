import { createFocusedComparisonScreenshot } from '@/agent/cache-action-verification-image';
import {
  CacheActionVerificationError,
  findCacheActionVerificationError,
  verifyCacheActionEffect,
} from '@/agent/cache-action-verifier';
import { verifyCacheActionWithAI } from '@/ai-model/cache-action-verification';
import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import type Service from '@/service';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/agent/cache-action-verification-image', () => ({
  createFocusedComparisonScreenshot: vi.fn(),
}));
vi.mock('@/ai-model/cache-action-verification', () => ({
  verifyCacheActionWithAI: vi.fn(),
}));

const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createContext(capturedAt: number): UIContext {
  return {
    screenshot: ScreenshotItem.create(PNG_BASE64, capturedAt),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  } as UIContext;
}

const modelRuntime = getModelRuntime({
  modelName: 'mock-model',
  modelDescription: 'mock model',
  intent: 'insight',
  slot: 'insight',
});
const targetRect = { left: 10, top: 20, width: 30, height: 40 };
const service = { taskInfo: undefined } as unknown as Service;

describe('verifyCacheActionEffect', () => {
  beforeEach(() => {
    vi.mocked(createFocusedComparisonScreenshot).mockReset();
    vi.mocked(verifyCacheActionWithAI).mockReset();
  });

  it('uses one focused comparison image for a conclusive verdict', async () => {
    const comparisonScreenshot = ScreenshotItem.create(PNG_BASE64, 2);
    vi.mocked(createFocusedComparisonScreenshot).mockResolvedValue({
      screenshot: comparisonScreenshot,
      cropRect: { left: 0, top: 0, width: 80, height: 60 },
      comparisonImageSize: { width: 200, height: 60 },
    });
    vi.mocked(verifyCacheActionWithAI).mockResolvedValue({
      data: {
        status: 'passed',
        reason: 'Visible focus ring and caret.',
      },
      rawResponse:
        '{"status":"passed","reason":"Visible focus ring and caret."}',
    });
    const beforeContext = createContext(1);
    const afterContext = createContext(2);

    const result = await verifyCacheActionEffect(service, modelRuntime, {
      actionName: 'Tap',
      targetDescription: 'search input',
      beforeScreenshot: beforeContext.screenshot,
      afterContext,
      targetRect,
    });

    expect(verifyCacheActionWithAI).toHaveBeenCalledWith({
      mode: 'focused-comparison',
      screenshots: [comparisonScreenshot],
      dataDemand: expect.objectContaining({
        status: expect.stringContaining('search input'),
        reason: expect.stringContaining('Visible evidence'),
      }),
      modelRuntime,
      abortSignal: undefined,
    });
    expect(result.result).toEqual({
      status: 'passed',
      reason: 'Visible focus ring and caret.',
      request: {
        actionName: 'Tap',
        targetDescription: 'search input',
        logicalModelRequestCount: 1,
        screenshotCount: 2,
        modelInputImageCount: 1,
        verificationMode: 'focused-comparison',
        cropRect: { left: 0, top: 0, width: 80, height: 60 },
        comparisonImageSize: { width: 200, height: 60 },
        dataDemand: expect.objectContaining({
          status: expect.stringContaining('search input'),
        }),
      },
    });
    expect(result.dump).toMatchObject({
      type: 'extract',
      data: {
        status: 'passed',
        reason: 'Visible focus ring and caret.',
      },
      taskInfo: {
        rawResponse:
          '{"status":"passed","reason":"Visible focus ring and caret."}',
      },
    });
    expect(result.modelInputImages).toEqual([
      {
        requestIndex: 1,
        role: 'focused-comparison',
        screenshot: comparisonScreenshot,
      },
    ]);
  });

  it('falls back to full screenshots when the focused verdict is uncertain', async () => {
    const comparisonScreenshot = ScreenshotItem.create(PNG_BASE64, 2);
    vi.mocked(createFocusedComparisonScreenshot).mockResolvedValue({
      screenshot: comparisonScreenshot,
      cropRect: { left: 0, top: 0, width: 80, height: 60 },
      comparisonImageSize: { width: 200, height: 60 },
    });
    vi.mocked(verifyCacheActionWithAI)
      .mockResolvedValueOnce({
        data: { status: 'uncertain', reason: 'Crop lacks enough context.' },
        rawResponse: '{"status":"uncertain"}',
      })
      .mockResolvedValueOnce({
        data: { status: 'passed', reason: 'Full view shows selected state.' },
        rawResponse: '{"status":"passed"}',
      });
    const beforeContext = createContext(1);
    const afterContext = createContext(2);

    const result = await verifyCacheActionEffect(service, modelRuntime, {
      actionName: 'Tap',
      targetDescription: 'Completed filter',
      beforeScreenshot: beforeContext.screenshot,
      afterContext,
      targetRect,
    });

    expect(verifyCacheActionWithAI).toHaveBeenCalledTimes(2);
    expect(verifyCacheActionWithAI).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: 'focused-comparison',
        screenshots: [comparisonScreenshot],
      }),
    );
    expect(verifyCacheActionWithAI).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mode: 'full-frame',
        screenshots: [beforeContext.screenshot, afterContext.screenshot],
      }),
    );
    expect(result.result).toMatchObject({
      status: 'passed',
      request: {
        logicalModelRequestCount: 2,
        modelInputImageCount: 3,
        verificationMode: 'focused-comparison-with-full-frame-fallback',
        fallbackReason: 'uncertain',
        cropRect: { left: 0, top: 0, width: 80, height: 60 },
        comparisonImageSize: { width: 200, height: 60 },
      },
    });
    expect(result.modelInputImages).toEqual([
      {
        requestIndex: 1,
        role: 'focused-comparison',
        screenshot: comparisonScreenshot,
      },
      {
        requestIndex: 2,
        role: 'full-frame-before',
        screenshot: beforeContext.screenshot,
      },
      {
        requestIndex: 2,
        role: 'full-frame-after',
        screenshot: afterContext.screenshot,
      },
    ]);
  });

  it('uses full screenshots directly when the target rect is unavailable', async () => {
    vi.mocked(verifyCacheActionWithAI).mockResolvedValue({
      data: { status: 'passed', reason: 'Full view shows focus.' },
      rawResponse: '{"status":"passed"}',
    });
    const beforeContext = createContext(1);
    const afterContext = createContext(2);

    const result = await verifyCacheActionEffect(service, modelRuntime, {
      actionName: 'Tap',
      targetDescription: 'search input',
      beforeScreenshot: beforeContext.screenshot,
      afterContext,
    });

    expect(createFocusedComparisonScreenshot).not.toHaveBeenCalled();
    expect(verifyCacheActionWithAI).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'full-frame',
        screenshots: [beforeContext.screenshot, afterContext.screenshot],
      }),
    );
    expect(result.result.request).toMatchObject({
      logicalModelRequestCount: 1,
      modelInputImageCount: 2,
      verificationMode: 'full-frame',
      fallbackReason: 'target-rect-unavailable',
    });
  });

  it('throws on an invalid AI verdict instead of trusting the cache', async () => {
    vi.mocked(createFocusedComparisonScreenshot).mockResolvedValue({
      screenshot: ScreenshotItem.create(PNG_BASE64, 2),
      cropRect: targetRect,
      comparisonImageSize: { width: 10, height: 1 },
    });
    vi.mocked(verifyCacheActionWithAI).mockResolvedValue({
      data: { status: 'yes' as 'passed', reason: '' },
      rawResponse: '{"status":"yes","reason":""}',
    });

    await expect(
      verifyCacheActionEffect(service, modelRuntime, {
        actionName: 'Tap',
        targetDescription: 'search input',
        beforeScreenshot: createContext(1).screenshot,
        afterContext: createContext(2),
        targetRect,
      }),
    ).rejects.toThrow('Invalid cached action verification response');
  });
});

describe('findCacheActionVerificationError', () => {
  it('does not recurse forever when an error cause contains a cycle', () => {
    const cyclicError: { cause?: unknown } = {};
    cyclicError.cause = cyclicError;

    expect(findCacheActionVerificationError(cyclicError)).toBeUndefined();
  });

  it('finds a verification error inside wrapped task errors', () => {
    const verificationError = new CacheActionVerificationError(
      {
        status: 'failed',
        reason: 'the target did not react',
        request: {
          actionName: 'Tap',
          targetDescription: 'search input',
          logicalModelRequestCount: 1,
          screenshotCount: 2,
          modelInputImageCount: 1,
          verificationMode: 'focused-comparison',
          dataDemand: {
            status: 'status demand',
            reason: 'reason demand',
          },
        },
      },
      ['search input'],
    );
    const wrapper = {
      errorTask: { error: verificationError },
      cause: { cause: undefined },
    };

    expect(findCacheActionVerificationError(wrapper)).toBe(verificationError);
  });
});
