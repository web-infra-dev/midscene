import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import sharp from 'sharp';
import { createFakeContext } from '../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  AIResponseParseError: class AIResponseParseError extends Error {},
  callAI: rs.fn(),
  callAIWithObjectResponse: rs.fn(),
  callAIWithStringResponse: rs.fn(),
}));

import { callAI } from '@/ai-model/service-caller/index';
import { AiExtractElementInfo } from '@/ai-model/workflows/insight';

describe('insight extraction multi-frame context', () => {
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

  it('adds enlarged change-region frames for a subtle localized transition', async () => {
    const makeFrame = async (changed: boolean, capturedAt: number) => {
      const base = sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: { r: 240, g: 240, b: 240 },
        },
      });
      const image = changed
        ? base.composite([
            {
              input: {
                create: {
                  width: 120,
                  height: 60,
                  channels: 3,
                  background: { r: 120, g: 120, b: 120 },
                },
              },
              left: 850,
              top: 600,
            },
          ])
        : base;
      const bytes = await image.jpeg().toBuffer();
      return ScreenshotItem.create(
        `data:image/jpeg;base64,${bytes.toString('base64')}`,
        capturedAt,
      );
    };
    const sequence = [
      await makeFrame(false, 100),
      await makeFrame(true, 200),
      await makeFrame(false, 300),
    ];
    const context = {
      ...createFakeContext(),
      screenshot: sequence[2],
      screenshotSequence: sequence,
    };

    await AiExtractElementInfo<{ result: boolean }>({
      context,
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether a button visibly changed',
      },
      modelRuntime: getModelRuntime(modelConfig),
    });

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    const userContent = msgs?.[1]?.content as Array<Record<string, any>>;
    const imageParts = userContent.filter((part) => part.type === 'image_url');
    expect(imageParts).toHaveLength(5);
    expect(imageParts.at(-2)?.image_url.url).toBe(sequence[0].base64);
    expect(imageParts.at(-1)?.image_url.url).toBe(sequence[2].base64);
    expect(
      userContent.some(
        (part) =>
          part.type === 'text' &&
          part.text.includes('candidate change regions'),
      ),
    ).toBe(true);
    expect(context.screenshotSequenceFocus).toHaveLength(3);
    expect(context.screenshotSequenceFocusFrameIndices).toEqual([0, 1, 2]);
  });

  it('falls back to bounded original frames when focus generation fails', async () => {
    const base = createFakeContext();
    const sequence = Array.from({ length: 12 }, (_, index) =>
      ScreenshotItem.create(
        index === 0
          ? 'data:image/png;base64,not-an-image'
          : base.screenshot.base64,
        index,
      ),
    );
    const context = {
      ...base,
      screenshot: sequence.at(-1)!,
      screenshotSequence: sequence,
      screenshotSequenceFocus: [base.screenshot],
      screenshotSequenceFocusFrameIndices: [2],
    };

    await AiExtractElementInfo<{ result: boolean }>({
      context,
      dataQuery: { StatementIsTruthy: 'Boolean, whether the UI changed' },
      modelRuntime: getModelRuntime(modelConfig),
    });

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    const userContent = msgs?.[1]?.content as Array<Record<string, any>>;
    const imageParts = userContent.filter((part) => part.type === 'image_url');
    expect(imageParts).toHaveLength(8);
    expect(imageParts[0].image_url.url).toBe(sequence[0].base64);
    expect(imageParts.at(-1)?.image_url.url).toBe(sequence.at(-1)?.base64);
    expect(context.screenshotSequenceFocus).toBeUndefined();
    expect(context.screenshotSequenceFocusFrameIndices).toBeUndefined();
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
