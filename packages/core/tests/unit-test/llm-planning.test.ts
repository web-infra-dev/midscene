import {
  MidsceneLocation,
  adaptQwenBbox,
  fillBboxParam,
} from '@/ai-model/common';
import { buildYamlFlowFromPlans } from '@/ai-model/common';
import {
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_QWEN_VL,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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
  beforeEach(() => {
    vi.stubEnv(OPENAI_BASE_URL, 'http://mock');
    vi.stubEnv(OPENAI_API_KEY, 'mock');
    vi.stubEnv(MIDSCENE_USE_DOUBAO_VISION, 'true');
    vi.stubEnv(MIDSCENE_USE_QWEN_VL, 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fill locate param', () => {
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox_2d: [923, 123, 123, 123] as [number, number, number, number],
    };

    const filledLocate = fillBboxParam(locate, 1000, 1000, {
      intent: 'grounding',
    });
    expect(filledLocate).toEqual({
      id: 'test',
      prompt: 'test',
      bbox: [923, 123, 123, 123],
    });
  });
});

describe('llm planning - build yaml flow', () => {
  it('build yaml flow', () => {
    const flow = buildYamlFlowFromPlans(
      [
        {
          type: 'Input',
          locate: {
            bbox: [512, 127, 1068, 198],
            prompt: 'The input box for adding a new todo',
          },
          param: {
            value: 'hello',
            locate: {
              bbox: [512, 127, 1068, 198],
              prompt: 'The input box for adding a new todo',
            },
          },
        },
        {
          type: 'Hover',
          param: null,
        },
        {
          type: 'Tap',
          locate: {
            bbox: [512, 127, 1068, 197],
            prompt: "The input box labeled 'What needs to be done?'",
          },
          param: {
            locate: {
              bbox: [512, 127, 1068, 197],
              prompt: "The input box labeled 'What needs to be done?'",
            },
          },
        },
        {
          param: {
            direction: 'down',
            distance: 500,
            scrollType: 'once',
          },
          thought: 'Scroll down the page by 500px to view more content.',
          type: 'Scroll',
        },
      ],
      [
        {
          name: 'Input',
          interfaceAlias: 'aiInput',
          paramSchema: z.object({
            value: z.string(),
            locate: MidsceneLocation,
          }),
          call: async () => {},
        },
        {
          name: 'Hover',
          interfaceAlias: 'aiHover',
          call: async () => {},
        },
        {
          name: 'Tap', // TODO: should throw error here
          interfaceAlias: 'aiTap',
          call: async () => {},
        },
        {
          name: 'Scroll', // no alias for this
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "aiInput": "The input box for adding a new todo",
          "locate": {
            "bbox": [
              512,
              127,
              1068,
              198,
            ],
            "prompt": "The input box for adding a new todo",
          },
          "value": "hello",
        },
        {
          "aiHover": "",
        },
        {
          "aiTap": "The input box labeled 'What needs to be done?'",
          "locate": {
            "bbox": [
              512,
              127,
              1068,
              197,
            ],
            "prompt": "The input box labeled 'What needs to be done?'",
          },
        },
        {
          "action_space_Scroll": "",
          "direction": "down",
          "distance": 500,
          "scrollType": "once",
        },
      ]
    `);
  });

  it('build yaml flow with simplified format for single locator param', () => {
    const flow = buildYamlFlowFromPlans(
      [
        {
          type: 'Tap',
          locate: {
            bbox: [300, 300, 400, 400],
            prompt: 'Cancel button',
          },
          param: {
            locate: {
              bbox: [300, 300, 400, 400],
              prompt: 'Cancel button',
            },
          },
        },
        {
          type: 'Input',
          locate: {
            bbox: [500, 500, 600, 600],
            prompt: 'Text input field',
          },
          param: {
            value: 'test',
            locate: {
              bbox: [500, 500, 600, 600],
              prompt: 'Text input field',
            },
          },
        },
      ],
      [
        {
          name: 'Tap',
          interfaceAlias: 'aiTap',
          paramSchema: z.object({
            locate: MidsceneLocation,
          }),
          call: async () => {},
        },
        {
          name: 'Input',
          interfaceAlias: 'aiInput',
          paramSchema: z.object({
            value: z.string(),
            locate: MidsceneLocation,
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "aiTap": "Cancel button",
          "locate": {
            "bbox": [
              300,
              300,
              400,
              400,
            ],
            "prompt": "Cancel button",
          },
        },
        {
          "aiInput": "Text input field",
          "locate": {
            "bbox": [
              500,
              500,
              600,
              600,
            ],
            "prompt": "Text input field",
          },
          "value": "test",
        },
      ]
    `);
  });

  it('build yaml flow without simplified format when no alias', () => {
    const flow = buildYamlFlowFromPlans(
      [
        {
          type: 'Click',
          locate: {
            bbox: [100, 100, 200, 200],
            prompt: 'Submit button',
          },
          param: {
            locate: {
              bbox: [100, 100, 200, 200],
              prompt: 'Submit button',
            },
          },
        },
      ],
      [
        {
          name: 'Click',
          // No interfaceAlias
          paramSchema: z.object({
            locate: MidsceneLocation,
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "action_space_Click": "Submit button",
          "locate": {
            "bbox": [
              100,
              100,
              200,
              200,
            ],
            "prompt": "Submit button",
          },
        },
      ]
    `);
  });

  it('build yaml flow without simplified format when multiple params', () => {
    const flow = buildYamlFlowFromPlans(
      [
        {
          type: 'DragAndDrop',
          param: {
            from: {
              bbox: [100, 100, 200, 200],
              prompt: 'Source element',
            },
            to: {
              bbox: [300, 300, 400, 400],
              prompt: 'Target element',
            },
          },
        },
      ],
      [
        {
          name: 'DragAndDrop',
          interfaceAlias: 'aiDragAndDrop',
          paramSchema: z.object({
            from: MidsceneLocation,
            to: MidsceneLocation,
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "aiDragAndDrop": "",
          "from": {
            "bbox": [
              100,
              100,
              200,
              200,
            ],
            "prompt": "Source element",
          },
          "to": {
            "bbox": [
              300,
              300,
              400,
              400,
            ],
            "prompt": "Target element",
          },
        },
      ]
    `);
  });

  it('build yaml flow without simplified format when param is not locator field', () => {
    const flow = buildYamlFlowFromPlans(
      [
        {
          type: 'Wait',
          param: {
            duration: 1000,
          },
        },
      ],
      [
        {
          name: 'Wait',
          interfaceAlias: 'aiWait',
          paramSchema: z.object({
            duration: z.number(),
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toEqual([
      {
        aiWait: '',
        duration: 1000,
      },
    ]);
  });
});
