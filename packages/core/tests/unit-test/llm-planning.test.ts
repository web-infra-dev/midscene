import { parseXMLPlanningResponse } from '@/ai-model/llm-planning';
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
      bboxCenter: { x: 523, y: 123 },
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

describe('parseXMLPlanningResponse', () => {
  it('should parse complete XML response with all fields', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>I need to click the login button</thought>
<note>User credentials are already filled</note>
<log>Click the login button</log>
<error></error>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "The login button",
    "bbox": [100, 200, 300, 400]
  }
}
</action-param-json>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      thought: 'I need to click the login button',
      note: 'User credentials are already filled',
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

  it('should parse XML response with only required fields', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<log>Performing action</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "Button"
  }
}
</action-param-json>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
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

  it('should parse XML response with null action', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<log>Task completed</log>
<action-type>null</action-type>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      log: 'Task completed',
      action: null,
    });
  });

  it('should parse XML response without action-type', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<log>Just logging</log>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      log: 'Just logging',
      action: null,
    });
  });

  it('should parse XML response with error field', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<log>Attempting to recover</log>
<error>Previous action failed</error>
<action-type>Scroll</action-type>
<action-param-json>
{
  "direction": "down"
}
</action-param-json>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
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
    const xml = `
<log>Waiting</log>
<action-type>Wait</action-type>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      log: 'Waiting',
      action: {
        type: 'Wait',
      },
    });
  });

  it('should handle multiline content in tags', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>
  This is a complex thought
  spanning multiple lines
</thought>
<log>Executing complex action</log>
<action-type>Input</action-type>
<action-param-json>
{
  "value": "test value",
  "locate": {
    "prompt": "input field"
  }
}
</action-param-json>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result.thought).toBe(
      'This is a complex thought\n  spanning multiple lines',
    );
    expect(result.log).toBe('Executing complex action');
    expect(result.action?.type).toBe('Input');
  });

  it('should not throw error when log field is missing and no action', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Some thought</thought>
<complete-goal success="true">Task completed</complete-goal>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);
    expect(result).toEqual({
      thought: 'Some thought',
      log: '',
      action: null,
      finalizeMessage: 'Task completed',
      finalizeSuccess: true,
    });
  });

  it('should throw error when action-param-json is invalid JSON', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<log>Action</log>
<action-type>Tap</action-type>
<action-param-json>
{invalid json}
</action-param-json>
    `.trim();

    expect(() => parseXMLPlanningResponse(xml, modelFamily)).toThrow(
      'Failed to parse action-param-json',
    );
  });

  it('should handle case-insensitive tag matching', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<LOG>Case insensitive log</LOG>
<ACTION-TYPE>Tap</ACTION-TYPE>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result.log).toBe('Case insensitive log');
    expect(result.action?.type).toBe('Tap');
  });

  it('should parse XML with special characters in content', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<log>Click "Submit" button</log>
<note>Values: <100 & >50</note>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "Button with & symbol"
  }
}
</action-param-json>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result.log).toBe('Click "Submit" button');
    expect(result.note).toBe('Values: <100 & >50');
    expect(result.action?.param.locate.prompt).toBe('Button with & symbol');
  });

  it('should parse complete-goal tag with success=true and message', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Task completed successfully</thought>
<complete-goal success="true">The product names are: 'Product A', 'Product B', 'Product C'</complete-goal>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      thought: 'Task completed successfully',
      log: '',
      action: null,
      finalizeMessage:
        "The product names are: 'Product A', 'Product B', 'Product C'",
      finalizeSuccess: true,
    });
  });

  it('should parse complete-goal tag with success=false and error message', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Task failed</thought>
<complete-goal success="false">Unable to find the required element on the page</complete-goal>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      thought: 'Task failed',
      log: '',
      action: null,
      finalizeMessage: 'Unable to find the required element on the page',
      finalizeSuccess: false,
    });
  });

  it('should parse complete-goal tag with empty message', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Task completed</thought>
<complete-goal success="true"></complete-goal>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      thought: 'Task completed',
      log: '',
      action: null,
      finalizeSuccess: true,
    });
  });

  it('should parse complete-goal tag with multiline message', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Data extraction completed</thought>
<complete-goal success="true">
Extracted data:
- Item 1: Value A
- Item 2: Value B
- Item 3: Value C
</complete-goal>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      thought: 'Data extraction completed',
      log: '',
      action: null,
      finalizeMessage:
        'Extracted data:\n- Item 1: Value A\n- Item 2: Value B\n- Item 3: Value C',
      finalizeSuccess: true,
    });
  });

  it('should parse complete-goal tag along with other optional fields', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>All tasks completed successfully</thought>
<note>Total items processed: 10</note>
<complete-goal success="true">All 10 items have been processed</complete-goal>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      thought: 'All tasks completed successfully',
      log: '',
      note: 'Total items processed: 10',
      action: null,
      finalizeMessage: 'All 10 items have been processed',
      finalizeSuccess: true,
    });
  });

  it('should handle complete-goal tag case insensitively', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Task done</thought>
<COMPLETE-GOAL success="true">Success message</COMPLETE-GOAL>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result).toEqual({
      thought: 'Task done',
      log: '',
      action: null,
      finalizeMessage: 'Success message',
      finalizeSuccess: true,
    });
  });

  it('should parse update-plan-content with sub-goals', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Breaking down the task</thought>
<log>Planning the steps</log>
<update-plan-content>
  <sub-goal index="1" status="pending">Log in to the system</sub-goal>
  <sub-goal index="2" status="pending">Complete all to-do items</sub-goal>
  <sub-goal index="3" status="pending">Submit the registration form</sub-goal>
</update-plan-content>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

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

  it('should parse mark-sub-goal-done with finished indexes', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>First step completed</thought>
<log>Moving to next step</log>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result.markFinishedIndexes).toEqual([1]);
  });

  it('should parse multiple finished indexes in mark-sub-goal-done', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Multiple steps completed</thought>
<log>Great progress</log>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
  <sub-goal index="2" status="finished" />
</mark-sub-goal-done>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result.markFinishedIndexes).toEqual([1, 2]);
  });

  it('should parse both update-plan-content and mark-sub-goal-done', () => {
    const modelFamily = 'doubao-vision';
    const xml = `
<thought>Updating plan after progress</thought>
<log>Continuing work</log>
<update-plan-content>
  <sub-goal index="1" status="finished">Log in to the system</sub-goal>
  <sub-goal index="2" status="pending">Complete all to-do items</sub-goal>
</update-plan-content>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
    `.trim();

    const result = parseXMLPlanningResponse(xml, modelFamily);

    expect(result.updateSubGoals).toEqual([
      { index: 1, status: 'finished', description: 'Log in to the system' },
      { index: 2, status: 'pending', description: 'Complete all to-do items' },
    ]);
    expect(result.markFinishedIndexes).toEqual([1]);
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
