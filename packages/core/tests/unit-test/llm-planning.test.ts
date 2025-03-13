import { fillLocateParam } from '@/ai-model/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('llm planning - qwen', () => {
  let originalMidsceneUseQwenVl: string | undefined;
  let originalMidsceneUseDoubaoVl: string | undefined;
  beforeEach(() => {
    originalMidsceneUseQwenVl = process.env.MIDSCENE_USE_QWEN_VL;
    originalMidsceneUseDoubaoVl = process.env.MIDSCENE_USE_DOUBAO_VISION;
    process.env.MIDSCENE_USE_QWEN_VL = 'true';
    process.env.MIDSCENE_USE_DOUBAO_VISION = 'false';
  });

  afterEach(() => {
    process.env.MIDSCENE_USE_QWEN_VL = originalMidsceneUseQwenVl;
    process.env.MIDSCENE_USE_DOUBAO_VISION = originalMidsceneUseDoubaoVl;
  });

  it('fill locate param', () => {
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox_2d: [100, 100, 200, 200] as [number, number, number, number],
    };

    const filledLocate = fillLocateParam(locate);
    expect(filledLocate).toEqual({
      id: 'test',
      prompt: 'test',
      bbox: [100, 100, 200, 200],
    });
  });

  it('fill locate param', () => {
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox_2d: [100, 100] as unknown as [number, number, number, number],
    };

    const filledLocate = fillLocateParam(locate);
    expect(filledLocate).toEqual({
      id: 'test',
      prompt: 'test',
      bbox: [100, 100, 110, 110],
    });
  });
});

describe('llm planning - doubao', () => {
  let originalMidsceneUseDoubaoVl: string | undefined;
  let originalMidsceneUseQwenVl: string | undefined;
  beforeEach(() => {
    originalMidsceneUseDoubaoVl = process.env.MIDSCENE_USE_DOUBAO_VISION;
    originalMidsceneUseQwenVl = process.env.MIDSCENE_USE_QWEN_VL;
    process.env.MIDSCENE_USE_DOUBAO_VISION = 'true';
    process.env.MIDSCENE_USE_QWEN_VL = 'false';
  });

  afterEach(() => {
    process.env.MIDSCENE_USE_DOUBAO_VISION = originalMidsceneUseDoubaoVl;
    process.env.MIDSCENE_USE_QWEN_VL = originalMidsceneUseQwenVl;
  });

  it('fill locate param', () => {
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox_2d: [0.923131, 0.123131, 0.123131, 0.123131] as [
        number,
        number,
        number,
        number,
      ],
    };

    const filledLocate = fillLocateParam(locate);
    expect(filledLocate).toEqual({
      id: 'test',
      prompt: 'test',
      bbox: [923, 123, 123, 123],
    });
  });
});
