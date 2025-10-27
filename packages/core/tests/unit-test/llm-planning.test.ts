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
          - withDefault?: string"
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

describe('llm planning - additional Zod types support', () => {
  it('should handle ZodDate', () => {
    const schema = z.object({
      createdAt: z.date().describe('Creation date'),
    });

    const action = {
      name: 'DateAction',
      description: 'Action with date field',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- DateAction, Action with date field
        - type: "DateAction"
        - param:
          - createdAt: Date // Creation date"
    `);
  });

  it('should handle ZodLiteral with string', () => {
    const schema = z.object({
      mode: z.literal('readonly').describe('Operation mode'),
    });

    const action = {
      name: 'LiteralAction',
      description: 'Action with literal field',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- LiteralAction, Action with literal field
        - type: "LiteralAction"
        - param:
          - mode: 'readonly' // Operation mode"
    `);
  });

  it('should handle ZodLiteral with number', () => {
    const schema = z.object({
      version: z.literal(1),
    });

    const action = {
      name: 'VersionAction',
      description: 'Action with version',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- VersionAction, Action with version
        - type: "VersionAction"
        - param:
          - version: 1"
    `);
  });

  it('should handle ZodTuple', () => {
    const schema = z.object({
      coordinates: z
        .tuple([z.number(), z.number()])
        .describe('X and Y coordinates'),
    });

    const action = {
      name: 'TupleAction',
      description: 'Action with tuple',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- TupleAction, Action with tuple
        - type: "TupleAction"
        - param:
          - coordinates: [number, number] // X and Y coordinates"
    `);
  });

  it('should handle ZodRecord', () => {
    const schema = z.object({
      metadata: z.record(z.string()).describe('Metadata key-value pairs'),
    });

    const action = {
      name: 'RecordAction',
      description: 'Action with record',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- RecordAction, Action with record
        - type: "RecordAction"
        - param:
          - metadata: Record<string, string> // Metadata key-value pairs"
    `);
  });

  it('should handle ZodIntersection', () => {
    const schema = z.object({
      combined: z.intersection(
        z.object({ name: z.string() }),
        z.object({ age: z.number() }),
      ),
    });

    const action = {
      name: 'IntersectionAction',
      description: 'Action with intersection',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- IntersectionAction, Action with intersection
        - type: "IntersectionAction"
        - param:
          - combined: object & object"
    `);
  });

  it('should handle ZodArray with item type', () => {
    const schema = z.object({
      items: z.array(z.string()).describe('List of items'),
    });

    const action = {
      name: 'ArrayAction',
      description: 'Action with typed array',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- ArrayAction, Action with typed array
        - type: "ArrayAction"
        - param:
          - items: string[] // List of items"
    `);
  });

  it('should handle ZodPromise', () => {
    const schema = z.object({
      asyncData: z.promise(z.string()),
    });

    const action = {
      name: 'PromiseAction',
      description: 'Action with promise',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- PromiseAction, Action with promise
        - type: "PromiseAction"
        - param:
          - asyncData: Promise<string>"
    `);
  });

  it('should handle ZodReadonly', () => {
    const schema = z.object({
      config: z.string().readonly(),
    });

    const action = {
      name: 'ReadonlyAction',
      description: 'Action with readonly field',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    // Note: Zod's readonly() doesn't change the runtime type representation
    expect(description).toMatchInlineSnapshot(`
      "- ReadonlyAction, Action with readonly field
        - type: "ReadonlyAction"
        - param:
          - config: string"
    `);
  });

  it('should handle complex nested types', () => {
    const schema = z.object({
      data: z
        .array(z.tuple([z.string(), z.number()]))
        .describe('Array of name-value pairs'),
    });

    const action = {
      name: 'ComplexNested',
      description: 'Complex nested structure',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- ComplexNested, Complex nested structure
        - type: "ComplexNested"
        - param:
          - data: [string, number][] // Array of name-value pairs"
    `);
  });

  it('should handle ZodNull and ZodUndefined in union', () => {
    const schema = z.object({
      optional: z.union([z.string(), z.null(), z.undefined()]),
    });

    const action = {
      name: 'NullableAction',
      description: 'Action with nullable field',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    // Note: Unions with undefined make the field optional
    expect(description).toMatchInlineSnapshot(`
      "- NullableAction, Action with nullable field
        - type: "NullableAction"
        - param:
          - optional?: string | null | undefined"
    `);
  });

  it('should handle ZodAny and ZodUnknown', () => {
    const schema = z.object({
      anyField: z.any(),
      unknownField: z.unknown(),
    });

    const action = {
      name: 'SpecialTypes',
      description: 'Action with special types',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    // Note: any and unknown are treated as optional by Zod
    expect(description).toMatchInlineSnapshot(`
      "- SpecialTypes, Action with special types
        - type: "SpecialTypes"
        - param:
          - anyField?: any
          - unknownField?: unknown"
    `);
  });

  it('should handle ZodBigInt', () => {
    const schema = z.object({
      bigNumber: z.bigint().describe('Large integer value'),
    });

    const action = {
      name: 'BigIntAction',
      description: 'Action with bigint',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- BigIntAction, Action with bigint
        - type: "BigIntAction"
        - param:
          - bigNumber: bigint // Large integer value"
    `);
  });

  it('should handle ZodPipeline', () => {
    const schema = z.object({
      piped: z.string().pipe(z.string().transform((s) => s.toUpperCase())),
    });

    const action = {
      name: 'PipelineAction',
      description: 'Action with pipeline',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- PipelineAction, Action with pipeline
        - type: "PipelineAction"
        - param:
          - piped: string"
    `);
  });

  it('should handle ZodBranded', () => {
    const schema = z.object({
      userId: z.string().brand<'UserId'>(),
    });

    const action = {
      name: 'BrandedAction',
      description: 'Action with branded type',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- BrandedAction, Action with branded type
        - type: "BrandedAction"
        - param:
          - userId: string"
    `);
  });

  it('should handle ZodCatch', () => {
    const schema = z.object({
      withCatch: z.string().catch('default'),
    });

    const action = {
      name: 'CatchAction',
      description: 'Action with catch',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    // Note: catch makes the field optional
    expect(description).toMatchInlineSnapshot(`
      "- CatchAction, Action with catch
        - type: "CatchAction"
        - param:
          - withCatch?: string"
    `);
  });

  it('should handle deeply nested wrapper types', () => {
    const schema = z.object({
      complex: z
        .union([z.string(), z.number()])
        .transform((val) => String(val))
        .optional()
        .describe('Complex wrapped type'),
    });

    const action = {
      name: 'DeeplyNested',
      description: 'Deeply nested wrappers',
      paramSchema: schema,
      call: async () => {},
    };

    const description = descriptionForAction(action, 'string');
    expect(description).toMatchInlineSnapshot(`
      "- DeeplyNested, Deeply nested wrappers
        - type: "DeeplyNested"
        - param:
          - complex?: string | number // Complex wrapped type"
    `);
  });
});
