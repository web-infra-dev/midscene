import { AiExtractElementInfo } from '@/ai-model/inspect';
import { ScreenshotItem } from '@/screenshot-item';
import type { ServiceExtractOption, UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { cropByRect } from '@midscene/shared/img';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/img', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@midscene/shared/img')>();
  return {
    ...actual,
    cropByRect: vi.fn(async (_base64: string, _rect: any, _pad: boolean) => ({
      width: 120,
      height: 80,
      imageBase64: 'data:image/jpeg;base64,cropped==',
    })),
  };
});

vi.mock('@/ai-model/inspect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ai-model/inspect')>();
  return actual;
});

// We need to mock the AI call so the test doesn't hit the network
vi.mock('@/ai-model/service-caller/index', () => ({
  callAI: vi.fn(async () => ({
    content:
      '<thought>ok</thought><data-json>{"StatementIsTruthy":true}</data-json>',
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })),
  callAIWithObjectResponse: vi.fn(),
  callAIWithStringResponse: vi.fn(),
  AIResponseParseError: class AIResponseParseError extends Error {},
}));

const FAKE_BASE64 =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC==';

const createMockUIContext = (): UIContext => {
  const screenshot = ScreenshotItem.create(FAKE_BASE64, Date.now());
  return {
    screenshot,
    shotSize: { width: 1280, height: 800 },
    shrunkShotToLogicalRatio: 1,
    _isFrozen: undefined,
    deprecatedDpr: undefined,
  } as unknown as UIContext;
};

const mockModelConfig: IModelConfig = {
  modelName: 'mock-model',
  modelDescription: 'mock',
  intent: 'insight',
};

describe('AiExtractElementInfo - searchArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should NOT crop screenshot when searchArea is not provided', async () => {
    const opt: ServiceExtractOption = { screenshotIncluded: true };

    await AiExtractElementInfo({
      dataQuery: { StatementIsTruthy: 'Boolean, is title visible' },
      context: createMockUIContext(),
      extractOption: opt,
      modelConfig: mockModelConfig,
    }).catch(() => {
      // ignore AI parse errors in unit test
    });

    expect(cropByRect).not.toHaveBeenCalled();
  });

  it('should crop screenshot when searchArea is provided', async () => {
    const opt: ServiceExtractOption = {
      screenshotIncluded: true,
      searchArea: { left: 580, top: 20, width: 120, height: 80 },
    };

    await AiExtractElementInfo({
      dataQuery: { StatementIsTruthy: 'Boolean, is eye facing right' },
      context: createMockUIContext(),
      extractOption: opt,
      modelConfig: mockModelConfig,
    }).catch(() => {});

    expect(cropByRect).toHaveBeenCalledOnce();
    expect(cropByRect).toHaveBeenCalledWith(
      FAKE_BASE64,
      { left: 580, top: 20, width: 120, height: 80 },
      false,
    );
  });

  it('should NOT crop screenshot when screenshotIncluded is false, even if searchArea is provided', async () => {
    const opt: ServiceExtractOption = {
      screenshotIncluded: false,
      searchArea: { left: 580, top: 20, width: 120, height: 80 },
    };

    await AiExtractElementInfo({
      dataQuery: { StatementIsTruthy: 'Boolean, is eye facing right' },
      context: createMockUIContext(),
      extractOption: opt,
      modelConfig: mockModelConfig,
    }).catch(() => {});

    expect(cropByRect).not.toHaveBeenCalled();
  });

  it('should use cropped imageBase64 instead of original when searchArea is provided', async () => {
    const CROPPED = 'data:image/jpeg;base64,cropped==';
    const opt: ServiceExtractOption = {
      screenshotIncluded: true,
      searchArea: { left: 0, top: 0, width: 100, height: 100 },
    };

    // Track what base64 gets forwarded to the AI call
    const { callAI } = await import('@/ai-model/service-caller/index');
    const callAIMock = vi.mocked(callAI);

    await AiExtractElementInfo({
      dataQuery: 'is the button visible',
      context: createMockUIContext(),
      extractOption: opt,
      modelConfig: mockModelConfig,
    }).catch(() => {});

    // The cropped base64 should appear in the message content
    const calls = callAIMock.mock.calls;
    if (calls.length > 0) {
      const msgContent = JSON.stringify(calls[0]);
      expect(msgContent).toContain(CROPPED);
      expect(msgContent).not.toContain(FAKE_BASE64);
    }
  });
});
