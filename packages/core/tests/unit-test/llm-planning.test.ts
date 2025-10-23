import {
  adaptQwenBbox,
  fillBboxParam,
  getMidsceneLocationSchema,
} from '@/ai-model/common';
import { buildYamlFlowFromPlans } from '@/ai-model/common';
import { descriptionForAction } from '@/ai-model/prompt/llm-planning';
import {
  MIDSCENE_USE_DOUBAO_VISION,
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

    const filledLocate = fillBboxParam(
      locate,
      1000,
      1000,
      1000,
      1000,
      'doubao-vision',
    );
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
            locate: getMidsceneLocationSchema(),
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
          name: 'Scroll', // no alias for this, no param schema
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "aiInput": "",
          "locate": "The input box for adding a new todo",
          "value": "hello",
        },
        {
          "aiHover": "",
        },
        {
          "aiTap": "",
        },
        {
          "Scroll": "",
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
            locate: getMidsceneLocationSchema(),
          }),
          call: async () => {},
        },
        {
          name: 'Input',
          interfaceAlias: 'aiInput',
          paramSchema: z.object({
            value: z.string(),
            locate: getMidsceneLocationSchema(),
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "aiTap": "",
          "locate": "Cancel button",
        },
        {
          "aiInput": "",
          "locate": "Text input field",
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
            locate: getMidsceneLocationSchema(),
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "Click": "",
          "locate": "Submit button",
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
            from: getMidsceneLocationSchema(),
            to: getMidsceneLocationSchema(),
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toMatchInlineSnapshot(`
      [
        {
          "aiDragAndDrop": "",
          "from": "Source element",
          "to": "Target element",
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

describe('llm planning - descriptionForAction with ZodEffects and ZodUnion', () => {
  it('should handle ZodEffects (transform)', () => {
    const schema = z.object({
      value: z.string().transform((val) => val.toLowerCase()),
    });

    const action = {
      name: 'TestAction',
      description: 'Test action with ZodEffects',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('value: string');
    expect(description).toContain('TestAction');
  });

  it('should handle ZodEffects with refinement', () => {
    const schema = z.object({
      email: z.string().email(),
    });

    const action = {
      name: 'ValidateEmail',
      description: 'Validate email action',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('email: string');
    expect(description).toContain('ValidateEmail');
  });

  it('should handle ZodEffects with description', () => {
    const schema = z.object({
      count: z
        .number()
        .transform((val) => val * 2)
        .describe('Number to be doubled'),
    });

    const action = {
      name: 'DoubleNumber',
      description: 'Double the number',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('count: number');
    expect(description).toContain('Number to be doubled');
  });

  it('should handle ZodUnion types', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });

    const action = {
      name: 'UnionTest',
      description: 'Test union types',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('value: string | number');
    expect(description).toContain('UnionTest');
  });

  it('should handle ZodUnion with multiple types', () => {
    const schema = z.object({
      status: z.union([z.string(), z.number(), z.boolean()]),
    });

    const action = {
      name: 'MultiUnion',
      description: 'Multiple union types',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('status: string | number | boolean');
  });

  it('should handle ZodUnion with description', () => {
    const schema = z.object({
      input: z
        .union([z.string(), z.number()])
        .describe('Either a string or number'),
    });

    const action = {
      name: 'FlexibleInput',
      description: 'Accepts string or number',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('input: string | number');
    expect(description).toContain('Either a string or number');
  });

  it('should handle optional ZodEffects', () => {
    const schema = z.object({
      optionalEmail: z.string().email().optional(),
    });

    const action = {
      name: 'OptionalEmail',
      description: 'Optional email field',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('optionalEmail?: string');
  });

  it('should handle optional ZodUnion', () => {
    const schema = z.object({
      optionalValue: z.union([z.string(), z.number()]).optional(),
    });

    const action = {
      name: 'OptionalUnion',
      description: 'Optional union field',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('optionalValue?: string | number');
  });

  it('should handle nullable ZodEffects', () => {
    const schema = z.object({
      nullableTransform: z
        .string()
        .transform((val) => val.toUpperCase())
        .nullable(),
    });

    const action = {
      name: 'NullableTransform',
      description: 'Nullable transform field',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('nullableTransform: string');
  });

  it('should handle ZodEffects with ZodUnion', () => {
    const schema = z.object({
      complexField: z
        .union([z.string(), z.number()])
        .transform((val) => String(val)),
    });

    const action = {
      name: 'ComplexField',
      description: 'Complex field with union and transform',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    // The transform wraps the union, so we should get string | number from the inner union
    expect(description).toContain('complexField: string | number');
  });

  it('should handle ZodDefault with ZodEffects', () => {
    const schema = z.object({
      withDefault: z
        .string()
        .transform((val) => val.trim())
        .default('default'),
    });

    const action = {
      name: 'DefaultTransform',
      description: 'Field with default and transform',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    // Fields with .default() are optional
    expect(description).toContain('withDefault?: string');
  });

  it('should handle complex nested ZodUnion', () => {
    const schema = z.object({
      nested: z.union([
        z.string(),
        z.object({ type: z.string(), value: z.number() }),
      ]),
    });

    const action = {
      name: 'NestedUnion',
      description: 'Nested union type',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toContain('nested: string | object');
  });
});
