import { getModelRuntime } from '@/ai-model/models';
import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../utils';

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAI: rs.fn(),
  callAIWithObjectResponse: rs.fn(),
  callAIWithStringResponse: rs.fn(),
}));

import { callAI } from '@/ai-model/service-caller/index';
import { AiExtractElementInfo } from '@/ai-model/workflows/inspect';

describe('AiExtractElementInfo multi-frame context', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'insight',
    slot: 'insight',
  };

  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(callAI).mockResolvedValue({
      content:
        '<thought>Saw the toast.</thought><data-json>{"result":true}</data-json>',
      usage: undefined,
      reasoning_content: undefined,
    } as any);
  });

  const withSequence = (frameCount: number): UIContext => {
    const base = createFakeContext();
    const sequence = Array.from({ length: frameCount }, () =>
      ScreenshotItem.create(base.screenshot.base64, Date.now()),
    );
    return {
      ...base,
      screenshot: sequence[frameCount - 1],
      screenshotSequence: sequence,
    };
  };

  it('submits every frame plus a sequence note when more than one frame is present', async () => {
    const context = withSequence(3);

    await AiExtractElementInfo<{ result: boolean }>({
      context,
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether a success toast briefly appeared',
      },
      modelRuntime: getModelRuntime(modelConfig),
    });

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    const userContent = msgs?.[1]?.content as Array<Record<string, any>>;

    const imageParts = userContent.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(3);

    const sequenceNote = userContent.find(
      (p) =>
        p.type === 'text' &&
        typeof p.text === 'string' &&
        p.text.includes('consecutive screenshots'),
    );
    expect(sequenceNote).toBeDefined();

    // The note must describe the ordered screenshot record without defining
    // one fixed truth rule for all assertions. The user's wording decides
    // whether to inspect the whole sequence, a later frame, or frame order.
    expect((sequenceNote as any).text).toContain(
      'Interpret the temporal scope from the statement or question itself',
    );
    expect((sequenceNote as any).text).toContain('compare frames in order');
    expect((sequenceNote as any).text).not.toContain('ANY of the frames');
    expect((sequenceNote as any).text).not.toContain(
      'the last image is the most recent state',
    );

    // single-frame note must not be present in sequence mode
    const singleNote = userContent.find(
      (p) =>
        p.type === 'text' &&
        typeof p.text === 'string' &&
        p.text.includes('This is the current screenshot to evaluate.'),
    );
    expect(singleNote).toBeUndefined();
  });

  it('falls back to the single-screenshot path when only one frame is present', async () => {
    const context = withSequence(1);

    await AiExtractElementInfo<{ result: boolean }>({
      context,
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether a success toast briefly appeared',
      },
      modelRuntime: getModelRuntime(modelConfig),
    });

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    const userContent = msgs?.[1]?.content as Array<Record<string, any>>;

    const imageParts = userContent.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(1);

    const singleNote = userContent.find(
      (p) =>
        p.type === 'text' &&
        typeof p.text === 'string' &&
        p.text.includes('This is the current screenshot to evaluate.'),
    );
    expect(singleNote).toBeDefined();
  });
});
