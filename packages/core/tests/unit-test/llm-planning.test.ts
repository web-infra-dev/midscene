import { parseJSONPlanningResponse } from '@/ai-model/llm-planning';
import { descriptionForAction } from '@/ai-model/prompt/llm-planning';
import {
  parseMarkFinishedIndexes,
  parseSubGoalsFromXML,
} from '@/ai-model/prompt/util';
import {
  adaptQwen2_5Bbox as adaptQwenBbox,
  fillBboxParam,
  getMidsceneLocationSchema,
} from '@/common';
import { buildYamlFlowFromPlans } from '@/common';
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
    expect(description).toMatchInlineSnapshot(`
      "- TestAction, Test action with ZodEffects
        - type: "TestAction"
        - param:
          - value: string"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- ValidateEmail, Validate email action
        - type: "ValidateEmail"
        - param:
          - email: string"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- DoubleNumber, Double the number
        - type: "DoubleNumber"
        - param:
          - count: number // Number to be doubled"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- UnionTest, Test union types
        - type: "UnionTest"
        - param:
          - value: string | number"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- MultiUnion, Multiple union types
        - type: "MultiUnion"
        - param:
          - status: string | number | boolean"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- FlexibleInput, Accepts string or number
        - type: "FlexibleInput"
        - param:
          - input: string | number // Either a string or number"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- OptionalEmail, Optional email field
        - type: "OptionalEmail"
        - param:
          - optionalEmail?: string"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- OptionalUnion, Optional union field
        - type: "OptionalUnion"
        - param:
          - optionalValue?: string | number"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- NullableTransform, Nullable transform field
        - type: "NullableTransform"
        - param:
          - nullableTransform: string"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- ComplexField, Complex field with union and transform
        - type: "ComplexField"
        - param:
          - complexField: string | number"
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- DefaultTransform, Field with default and transform
        - type: "DefaultTransform"
        - param:
          - withDefault?: string // default: "default""
    `);
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
    expect(description).toMatchInlineSnapshot(`
      "- NestedUnion, Nested union type
        - type: "NestedUnion"
        - param:
          - nested: string | object"
    `);
  });
});

describe('parseJSONPlanningResponse', () => {
  it('should parse complete JSON response with all fields', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'I need to click the login button',
      memory: 'User credentials are already filled',
      log: 'Click the login button',
      error: null,
      action_type: 'Tap',
      action_param: {
        locate: {
          prompt: 'The login button',
          bbox: [100, 200, 300, 400],
        },
      },
      complete: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'I need to click the login button',
      memory: 'User credentials are already filled',
      log: 'Click the login button',
      action: {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'The login button',
            bbox: [100, 200, 300, 400],
          },
        },
      },
    });
  });

  it('should parse JSON response with only required fields', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Performing action',
      log: 'Performing action',
      action_type: 'Tap',
      action_param: {
        locate: {
          prompt: 'Button',
        },
      },
      complete: null,
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Performing action',
      log: 'Performing action',
      action: {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'Button',
          },
        },
      },
    });
  });

  it('should parse JSON response with null action', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Task completed',
      log: 'Task completed',
      action_type: null,
      action_param: null,
      complete: null,
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Task completed',
      log: 'Task completed',
      action: null,
    });
  });

  it('should parse JSON response without action_type', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Just logging',
      log: 'Just logging',
      complete: null,
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Just logging',
      log: 'Just logging',
      action: null,
    });
  });

  it('should parse JSON response with error field', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Something went wrong',
      log: 'Attempting to recover',
      error: 'Previous action failed',
      action_type: 'Scroll',
      action_param: {
        direction: 'down',
      },
      complete: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Something went wrong',
      log: 'Attempting to recover',
      error: 'Previous action failed',
      action: {
        type: 'Scroll',
        param: {
          direction: 'down',
        },
      },
    });
  });

  it('should parse action without param', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Need to wait',
      log: 'Waiting',
      action_type: 'Wait',
      action_param: null,
      complete: null,
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Need to wait',
      log: 'Waiting',
      action: {
        type: 'Wait',
      },
    });
  });

  it('should handle multiline content in fields', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'This is a complex thought\nspanning multiple lines',
      log: 'Executing complex action',
      action_type: 'Input',
      action_param: {
        value: 'test value',
        locate: {
          prompt: 'input field',
        },
      },
      complete: null,
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result.thought).toBe(
      'This is a complex thought\nspanning multiple lines',
    );
    expect(result.log).toBe('Executing complex action');
    expect(result.action?.type).toBe('Input');
  });

  it('should parse complete with success=true and message', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Some thought',
      log: null,
      action_type: null,
      action_param: null,
      complete: { success: true, message: 'Task completed' },
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);
    expect(result).toEqual({
      thought: 'Some thought',
      log: '',
      action: null,
      finalizeMessage: 'Task completed',
      finalizeSuccess: true,
    });
  });

  it('should throw error when response is not a valid object', () => {
    const modelFamily = 'doubao-vision';
    const invalidJson = '"just a string"';

    expect(() => parseJSONPlanningResponse(invalidJson, modelFamily)).toThrow(
      'Planning response is not a valid JSON object',
    );
  });

  it('should parse complete with success=true and product names', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Task completed successfully',
      log: null,
      action_type: null,
      action_param: null,
      complete: {
        success: true,
        message:
          "The product names are: 'Product A', 'Product B', 'Product C'",
      },
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Task completed successfully',
      log: '',
      action: null,
      finalizeMessage:
        "The product names are: 'Product A', 'Product B', 'Product C'",
      finalizeSuccess: true,
    });
  });

  it('should parse complete with success=false and error message', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Task failed',
      log: null,
      action_type: null,
      action_param: null,
      complete: {
        success: false,
        message: 'Unable to find the required element on the page',
      },
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Task failed',
      log: '',
      action: null,
      finalizeMessage: 'Unable to find the required element on the page',
      finalizeSuccess: false,
    });
  });

  it('should parse complete with empty message', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Task completed',
      log: null,
      action_type: null,
      action_param: null,
      complete: { success: true, message: '' },
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Task completed',
      log: '',
      action: null,
      finalizeSuccess: true,
    });
  });

  it('should parse complete with multiline message', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Data extraction completed',
      log: null,
      action_type: null,
      action_param: null,
      complete: {
        success: true,
        message:
          'Extracted data:\n- Item 1: Value A\n- Item 2: Value B\n- Item 3: Value C',
      },
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'Data extraction completed',
      log: '',
      action: null,
      finalizeMessage:
        'Extracted data:\n- Item 1: Value A\n- Item 2: Value B\n- Item 3: Value C',
      finalizeSuccess: true,
    });
  });

  it('should parse complete along with other optional fields', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'All tasks completed successfully',
      memory: 'Total items processed: 10',
      log: null,
      action_type: null,
      action_param: null,
      complete: {
        success: true,
        message: 'All 10 items have been processed',
      },
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result).toEqual({
      thought: 'All tasks completed successfully',
      log: '',
      memory: 'Total items processed: 10',
      action: null,
      finalizeMessage: 'All 10 items have been processed',
      finalizeSuccess: true,
    });
  });

  it('should parse update_sub_goals', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Breaking down the task',
      log: 'Planning the steps',
      action_type: null,
      action_param: null,
      complete: null,
      error: null,
      update_sub_goals: [
        { index: 1, status: 'pending', description: 'Log in to the system' },
        {
          index: 2,
          status: 'pending',
          description: 'Complete all to-do items',
        },
        {
          index: 3,
          status: 'pending',
          description: 'Submit the registration form',
        },
      ],
      mark_finished_indexes: null,
      memory: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result.updateSubGoals).toEqual([
      { index: 1, status: 'pending', description: 'Log in to the system' },
      { index: 2, status: 'pending', description: 'Complete all to-do items' },
      {
        index: 3,
        status: 'pending',
        description: 'Submit the registration form',
      },
    ]);
  });

  it('should parse mark_finished_indexes', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'First step completed',
      log: 'Moving to next step',
      action_type: null,
      action_param: null,
      complete: null,
      error: null,
      update_sub_goals: null,
      mark_finished_indexes: [1],
      memory: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result.markFinishedIndexes).toEqual([1]);
  });

  it('should parse multiple finished indexes', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Multiple steps completed',
      log: 'Great progress',
      action_type: null,
      action_param: null,
      complete: null,
      error: null,
      update_sub_goals: null,
      mark_finished_indexes: [1, 2],
      memory: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result.markFinishedIndexes).toEqual([1, 2]);
  });

  it('should parse both update_sub_goals and mark_finished_indexes', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Updating plan after progress',
      log: 'Continuing work',
      action_type: null,
      action_param: null,
      complete: null,
      error: null,
      update_sub_goals: [
        {
          index: 1,
          status: 'finished',
          description: 'Log in to the system',
        },
        {
          index: 2,
          status: 'pending',
          description: 'Complete all to-do items',
        },
      ],
      mark_finished_indexes: [1],
      memory: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result.updateSubGoals).toEqual([
      { index: 1, status: 'finished', description: 'Log in to the system' },
      { index: 2, status: 'pending', description: 'Complete all to-do items' },
    ]);
    expect(result.markFinishedIndexes).toEqual([1]);
  });

  it('should handle string "true"/"false" for complete.success', () => {
    const modelFamily = 'doubao-vision';
    const json = JSON.stringify({
      thought: 'Done',
      log: null,
      action_type: null,
      action_param: null,
      complete: { success: 'true', message: 'Done' },
      error: null,
    });

    const result = parseJSONPlanningResponse(json, modelFamily);

    expect(result.finalizeSuccess).toBe(true);
    expect(result.finalizeMessage).toBe('Done');
  });
});

describe('parseSubGoalsFromXML', () => {
  it('should parse sub-goals with content', () => {
    const xml = `
  <sub-goal index="1" status="pending">First task</sub-goal>
  <sub-goal index="2" status="finished">Second task</sub-goal>
    `;

    const result = parseSubGoalsFromXML(xml);

    expect(result).toEqual([
      { index: 1, status: 'pending', description: 'First task' },
      { index: 2, status: 'finished', description: 'Second task' },
    ]);
  });

  it('should parse self-closing sub-goals', () => {
    const xml = `
  <sub-goal index="1" status="finished" />
  <sub-goal index="2" status="finished" />
    `;

    const result = parseSubGoalsFromXML(xml);

    expect(result).toEqual([
      { index: 1, status: 'finished', description: '' },
      { index: 2, status: 'finished', description: '' },
    ]);
  });

  it('should return empty array for empty content', () => {
    const result = parseSubGoalsFromXML('');
    expect(result).toEqual([]);
  });

  it('should handle mixed formats', () => {
    const xml = `
  <sub-goal index="1" status="finished" />
  <sub-goal index="2" status="pending">Task description</sub-goal>
    `;

    const result = parseSubGoalsFromXML(xml);

    expect(result).toEqual([
      { index: 1, status: 'finished', description: '' },
      { index: 2, status: 'pending', description: 'Task description' },
    ]);
  });
});

describe('parseMarkFinishedIndexes', () => {
  it('should parse finished indexes', () => {
    const xml = `
  <sub-goal index="1" status="finished" />
  <sub-goal index="3" status="finished" />
    `;

    const result = parseMarkFinishedIndexes(xml);

    expect(result).toEqual([1, 3]);
  });

  it('should return empty array for no matches', () => {
    const result = parseMarkFinishedIndexes('');
    expect(result).toEqual([]);
  });

  it('should ignore non-finished status', () => {
    const xml = `
  <sub-goal index="1" status="pending" />
  <sub-goal index="2" status="finished" />
    `;

    const result = parseMarkFinishedIndexes(xml);

    expect(result).toEqual([2]);
  });
});
