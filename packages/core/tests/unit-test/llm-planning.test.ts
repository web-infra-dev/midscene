import { adaptQwenBbox, fillBboxParam } from '@/ai-model/common';
import { buildYamlFlowFromPlans } from '@/ai-model/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('llm planning - qwen', () => {
  it('adapt qwen bbox', () => {
    const result = adaptQwenBbox([100, 100]);
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        100,
        120,
        120,
      ]
    `);
  });

  it('adapt qwen bbox', () => {
    const result = adaptQwenBbox([100, 100]);
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        100,
        120,
        120,
      ]
    `);
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
      bbox_2d: [923, 123, 123, 123] as [number, number, number, number],
    };

    const filledLocate = fillBboxParam(locate, 1000, 1000);
    expect(filledLocate).toEqual({
      id: 'test',
      prompt: 'test',
      bbox: [923, 123, 123, 123],
    });
  });
});

describe('llm planning - build yaml flow', () => {
  it('build yaml flow', () => {
    const flow = buildYamlFlowFromPlans([
      {
        type: 'Input',
        locate: {
          bbox: [512, 127, 1068, 198],
          prompt: 'The input box for adding a new todo',
        },
        param: {
          value: 'hello',
        },
      },
      {
        type: 'Hover',
        locate: {
          bbox: [521, 273, 692, 294],
          prompt: "The second item 'Learn Rust' in the task list",
        },
        param: null,
      },
      {
        type: 'Tap',
        locate: {
          bbox: [512, 127, 1068, 197],
          prompt: "The input box labeled 'What needs to be done?'",
        },
        param: null,
      },
      {
        locate: {
          id: 'button',
          prompt: 'some button',
        },
        param: {
          direction: 'down',
          distance: 500,
          scrollType: 'once',
        },
        thought: 'Scroll down the page by 500px to view more content.',
        type: 'Scroll',
      },
    ]);
    expect(flow).toMatchSnapshot();
  });
});
