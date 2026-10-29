import assert from 'node:assert/strict';
import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import type { ScreenshotSequenceEvidence, UIContext } from '@/types';
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

  it('submits bounded evidence plus an honest sequence note', async () => {
    const context = withSequence(3);

    await AiExtractElementInfo<{ result: boolean }>({
      context,
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether a success toast briefly appeared',
      },
      modelRuntime: getModelRuntime(modelConfig),
    });

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    const message = msgs?.[1];
    assert(message && 'role' in message);
    assert(Array.isArray(message.content));
    const userContent = message.content;

    const imageParts = userContent.filter((p) => p.type === 'image');
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
      'Interpret the temporal scope from <DATA_DEMAND>',
    );
    expect((sequenceNote as any).text).toContain(
      'compare the selected frames in order',
    );
    expect((sequenceNote as any).text).toContain(
      'not necessarily every captured frame',
    );
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
    const onObservationEvidence = rs.fn();
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
      onObservationEvidence,
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether a button visibly changed',
      },
      modelRuntime: getModelRuntime(modelConfig),
    });

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    const userMessage = msgs?.[1];
    assert(userMessage && 'content' in userMessage);
    const userContent = userMessage.content as Array<Record<string, any>>;
    const imageParts = userContent.filter((part) => part.type === 'image');
    expect(imageParts).toHaveLength(5);
    expect(imageParts.at(-2)?.url).toBe(sequence[0].base64);
    expect(imageParts.at(-1)?.url).toBe(sequence[2].base64);
    expect(
      userContent.some(
        (part) =>
          part.type === 'text' &&
          part.text.includes(
            'matching grids enlarged from selected source frames',
          ),
      ),
    ).toBe(true);
    const evidence: ScreenshotSequenceEvidence =
      onObservationEvidence.mock.calls[0][0];
    expect(evidence).toEqual({
      frames: expect.any(Array),
    });
    expect(evidence.frames).toHaveLength(5);
    expect(
      evidence.frames.map(({ sourceFrameIndex }) => sourceFrameIndex),
    ).toEqual([0, 1, 2, 0, 2]);
    expect(evidence.frames.map(({ screenshot }) => screenshot.base64)).toEqual(
      imageParts.map((part) => part.url),
    );
  });

  it('uses the same bounded original frames for the model and report when nothing changes', async () => {
    const onObservationEvidence = rs.fn();
    const base = createFakeContext();
    const sequence = Array.from({ length: 12 }, (_, index) =>
      ScreenshotItem.create(base.screenshot.base64, index),
    );
    const context = {
      ...base,
      screenshot: sequence.at(-1)!,
      screenshotSequence: sequence,
    };

    await AiExtractElementInfo<{ result: boolean }>({
      context,
      onObservationEvidence,
      dataQuery: { StatementIsTruthy: 'Boolean, whether the UI changed' },
      modelRuntime: getModelRuntime(modelConfig),
    });

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    const userMessage = msgs?.[1];
    assert(userMessage && 'content' in userMessage);
    const userContent = userMessage.content as Array<Record<string, any>>;
    const imageParts = userContent.filter((part) => part.type === 'image');
    expect(imageParts).toHaveLength(8);
    expect(imageParts[0].url).toBe(sequence[0].base64);
    expect(imageParts.at(-1)?.url).toBe(sequence.at(-1)?.base64);
    const evidence: ScreenshotSequenceEvidence =
      onObservationEvidence.mock.calls[0][0];
    expect(evidence.frames).toHaveLength(8);
    expect(evidence.frames.map(({ screenshot }) => screenshot.base64)).toEqual(
      imageParts.map((part) => part.url),
    );
  });

  it('reports corrupt source images as errors instead of claiming a complete observation', async () => {
    const context = withSequence(2);
    context.screenshotSequence![0] = ScreenshotItem.create(
      'data:image/png;base64,not-an-image',
      0,
    );
    await expect(
      AiExtractElementInfo({
        context,
        dataQuery: 'whether a button changed',
        modelRuntime: getModelRuntime(modelConfig),
      }),
    ).rejects.toThrow();
    expect(callAI).not.toHaveBeenCalled();
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
    const message = msgs?.[1];
    assert(message && 'role' in message);
    assert(Array.isArray(message.content));
    const userContent = message.content;

    const imageParts = userContent.filter((p) => p.type === 'image');
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
