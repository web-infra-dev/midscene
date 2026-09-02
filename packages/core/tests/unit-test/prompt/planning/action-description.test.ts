import {
  buildActionDescription,
  createDefaultMidscenePlanningProtocol,
} from '@/ai-model/model-adapter/default-planning-protocol';
import {
  buildActionOutputExample,
  serializeActionDescriptions,
} from '@/ai-model/prompt/planning';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import {
  defineActionInput,
  defineActionKeyboardPress,
  defineActionSwipe,
} from '@/device';
import { getMidsceneLocationSchema } from '@/index';
import { describe, expect, it } from '@rstest/core';
import yaml from 'js-yaml';
import { z } from 'zod';

const defaultMidscenePlanningProtocol = createDefaultMidscenePlanningProtocol({
  jsonParser: parseModelResponseJson,
});

const mockLocatePromptSpec: LocateResultPromptSpec = {
  resultKey: 'bbox',
  resultValueSchema: '[number, number, number, number]',
  resultValueDescription: 'bounding box coordinates',
  resultNoun: 'bounding box',
  resultNounPlural: 'bounding boxes',
  exampleValues: [[0, 0, 100, 100]],
};

const actionOutputProtocol =
  defaultMidscenePlanningProtocol.actionOutputProtocol;

const buildActionDescriptions = (
  action: Parameters<typeof buildActionDescription>[0]['action'],
  options: { locatePromptSpec?: LocateResultPromptSpec } = {},
) => {
  const actionOutputExample = buildActionOutputExample(action, {
    locatePromptSpec: options.locatePromptSpec,
    buildActionOutput: actionOutputProtocol.buildActionOutput,
  });
  const buildOptions = {
    action,
    locateFieldDescription:
      defaultMidscenePlanningProtocol.actionSpaceProtocol.buildLocateFieldDescription(
        options.locatePromptSpec,
      ),
    actionOutputExample,
  };
  const actionDescription = buildActionDescription(buildOptions);
  return {
    actionDescription,
    actionSpaceDescription: serializeActionDescriptions(
      [actionDescription],
      defaultMidscenePlanningProtocol.actionSpaceProtocol.format,
    ),
  };
};

describe('buildActionDescription and serializeActionDescriptions', () => {
  it('serializes action descriptions as valid YAML', () => {
    const actionSpace = [
      {
        name: 'Tap',
        description: 'Tap the element',
        paramSchema: z.object({
          locate: getMidsceneLocationSchema().describe(
            'The element to be tapped',
          ),
        }),
        sample: {
          locate: { prompt: 'the Submit button' },
        },
        call: async () => {},
      },
    ];

    const actionDescriptions = actionSpace.map((action) => {
      const actionOutputExample = buildActionOutputExample(action, {
        buildActionOutput: actionOutputProtocol.buildActionOutput,
      });
      return buildActionDescription({
        action,
        locateFieldDescription:
          defaultMidscenePlanningProtocol.actionSpaceProtocol.buildLocateFieldDescription(),
        actionOutputExample,
      });
    });
    const actionSpaceDescription = serializeActionDescriptions(
      actionDescriptions,
      defaultMidscenePlanningProtocol.actionSpaceProtocol.format,
    );

    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: Tap
        description: Tap the element
        param:
          locate:
            type: '{ prompt: string /* description of the target element */ }'
            description: The element to be tapped
        sample: |-
          <action-type>Tap</action-type>
          <action-param-json>
          {
            "locate": {
              "prompt": "the Submit button"
            }
          }
          </action-param-json>"
    `);
    expect(yaml.load(actionSpaceDescription)).toEqual(actionDescriptions);
  });

  it('serializes action descriptions as JSON Lines', () => {
    const actionDescriptions = [
      {
        name: 'Tap',
        description: 'Tap an element',
      },
      {
        name: 'Input',
        description: 'Input text',
      },
    ];

    expect(serializeActionDescriptions(actionDescriptions, 'jsonl')).toBe(
      [
        '{"name":"Tap","description":"Tap an element"}',
        '{"name":"Input","description":"Input text"}',
      ].join('\n'),
    );
  });

  it('action without param, no locate needed', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions({
        name: 'Tap',
        description: 'Tap the element',
        call: async () => {},
      });
    expect(action).toMatchInlineSnapshot(`
      {
        "description": "Tap the element",
        "type": "Tap",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: Tap
        description: Tap the element"
    `);
  });

  it('action with param, no locate needed', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions({
        name: 'Tap',
        description: 'Tap the element',
        paramSchema: z.object({
          foo: z.string().describe('The foo to be tapped'),
          bar: z.number().optional().describe('An optional bar value'),
          help: z.string().describe('Help information for this action'),
        }),
        call: async () => {},
      });
    expect(action).toMatchInlineSnapshot(`
      {
        "description": "Tap the element",
        "param": {
          "bar": {
            "description": "An optional bar value",
            "optional": true,
            "type": "number",
          },
          "foo": {
            "description": "The foo to be tapped",
            "type": "string",
          },
          "help": {
            "description": "Help information for this action",
            "type": "string",
          },
        },
        "type": "Tap",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: Tap
        description: Tap the element
        param:
          foo:
            type: string
            description: The foo to be tapped
          bar:
            type: number
            optional: true
            description: An optional bar value
          help:
            type: string
            description: Help information for this action"
    `);
  });

  it('action with param, multiple location fields', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions(
        {
          name: 'Tap',
          description: 'Tap the element',
          paramSchema: z.object({
            value: z.string().describe('The value to be tapped'),
            value2: z.number().describe('The value to be tapped').optional(),
            value3: z.number().describe('The value 3').optional().default(345),
            locate: getMidsceneLocationSchema().describe(
              'The element to be tapped',
            ),
            locate2: getMidsceneLocationSchema()
              .describe('The element to be tapped for the second time')
              .optional(),
            scrollType: z
              .enum([
                'once',
                'untilBottom',
                'untilTop',
                'untilRight',
                'untilLeft',
              ])
              .default('once')
              .describe('The scroll type'),
            actionType: z
              .enum(['Tap', 'DragAndDrop', 'Scroll', 'Input', 'Assert'])
              .describe('The scroll type')
              .default('Tap')
              .optional(),
            option: z.number().optional().describe('An optional option value'),
          }),
          call: async () => {},
        },
        {
          locatePromptSpec: mockLocatePromptSpec,
        },
      );
    expect(action).toMatchInlineSnapshot(`
      {
        "description": "Tap the element",
        "param": {
          "actionType": {
            "default": "Tap",
            "description": "The scroll type",
            "optional": true,
            "type": "enum('Tap', 'DragAndDrop', 'Scroll', 'Input', 'Assert')",
          },
          "locate": {
            "description": "The element to be tapped",
            "type": "{ prompt: string, bbox: [number, number, number, number] /* bounding box coordinates */ }",
          },
          "locate2": {
            "description": "The element to be tapped for the second time",
            "optional": true,
            "type": "{ prompt: string, bbox: [number, number, number, number] /* bounding box coordinates */ }",
          },
          "option": {
            "description": "An optional option value",
            "optional": true,
            "type": "number",
          },
          "scrollType": {
            "default": "once",
            "description": "The scroll type",
            "optional": true,
            "type": "enum('once', 'untilBottom', 'untilTop', 'untilRight', 'untilLeft')",
          },
          "value": {
            "description": "The value to be tapped",
            "type": "string",
          },
          "value2": {
            "description": "The value to be tapped",
            "optional": true,
            "type": "number",
          },
          "value3": {
            "default": 345,
            "description": "The value 3",
            "optional": true,
            "type": "number",
          },
        },
        "type": "Tap",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: Tap
        description: Tap the element
        param:
          value:
            type: string
            description: The value to be tapped
          value2:
            type: number
            optional: true
            description: The value to be tapped
          value3:
            type: number
            optional: true
            description: The value 3
            default: 345
          locate:
            type: '{ prompt: string, bbox: [number, number, number, number] /* bounding box coordinates */ }'
            description: The element to be tapped
          locate2:
            type: '{ prompt: string, bbox: [number, number, number, number] /* bounding box coordinates */ }'
            optional: true
            description: The element to be tapped for the second time
          scrollType:
            type: enum('once', 'untilBottom', 'untilTop', 'untilRight', 'untilLeft')
            optional: true
            description: The scroll type
            default: once
          actionType:
            type: enum('Tap', 'DragAndDrop', 'Scroll', 'Input', 'Assert')
            optional: true
            description: The scroll type
            default: Tap
          option:
            type: number
            optional: true
            description: An optional option value"
    `);
  });

  it('action with object param schema (Launch-like)', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions({
        name: 'Launch',
        description: 'Launch an app or URL',
        paramSchema: z.object({
          uri: z.string().describe('The URI to launch'),
        }),
        call: async () => {},
      });
    expect(action).toMatchInlineSnapshot(`
      {
        "description": "Launch an app or URL",
        "param": {
          "uri": {
            "description": "The URI to launch",
            "type": "string",
          },
        },
        "type": "Launch",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: Launch
        description: Launch an app or URL
        param:
          uri:
            type: string
            description: The URI to launch"
    `);
  });

  it('action with object param schema (RunAdbShell-like)', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions({
        name: 'RunAdbShell',
        description: 'Execute ADB shell command',
        paramSchema: z.object({
          command: z.string().describe('ADB shell command to execute'),
        }),
        call: async () => {},
      });
    expect(action).toMatchInlineSnapshot(`
      {
        "description": "Execute ADB shell command",
        "param": {
          "command": {
            "description": "ADB shell command to execute",
            "type": "string",
          },
        },
        "type": "RunAdbShell",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: RunAdbShell
        description: Execute ADB shell command
        param:
          command:
            type: string
            description: ADB shell command to execute"
    `);
  });

  it('input action explains typeOnly incremental edits', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions(
        defineActionInput({
          clearInput: async () => {},
          keyboardPress: async () => {},
          typeText: async () => {},
        }),
      );
    const serializedAction = JSON.stringify(action);

    expect(serializedAction).toContain(
      'only the inserted characters for typeOnly mode',
    );
    expect(serializedAction).toContain(
      'should be set explicitly for incremental edits after moving the cursor',
    );
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: Input
        description: Input the value into the element
        param:
          value:
            type: string | number
            description: The text to input. Provide the final content for replace mode, only the inserted characters for typeOnly mode, or an empty string when using clear mode to remove existing text.
          locate:
            type: '{ prompt: string /* description of the target element */ }'
            optional: true
            description: the position of the placeholder or text content in the target input field. If there is no content, locate the center of the input field.
          mode:
            type: enum('replace', 'clear', 'typeOnly')
            optional: true
            description: 'Input mode: "replace" (default) - clear the field and input the value; "typeOnly" - type the value directly without clearing the field first, and should be set explicitly for incremental edits after moving the cursor; "clear" - clear the field without inputting new text.'
            default: replace
          autoDismissKeyboard:
            type: boolean
            optional: true
            description: If true, the keyboard will be dismissed after the input is completed. Do not set it unless the user asks you to do so.
          keyboardTypeDelay:
            type: number
            optional: true
            description: Delay in milliseconds between keystrokes when typing. Passed through from device/user configuration. Do not set it unless the user asks you to do so.
          inputStrategy:
            type: enum('legacy', 'sequential', 'bulk')
            optional: true
            description: 'Text input strategy: "legacy" (default) preserves the current platform behavior; "sequential" enters one Unicode code point at a time; "bulk" sends the complete text through one platform input operation when supported and requires keyboardTypeDelay to be omitted or set to 0. Do not set it unless the user asks you to do so.'
        sample: |-
          <action-type>Input</action-type>
          <action-param-json>
          {
            "value": "test@example.com",
            "locate": {
              "prompt": "the email input field"
            }
          }
          </action-param-json>"
    `);
  });

  it('keyboard press tells the planner to omit locate for the current selection', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions(defineActionKeyboardPress(async () => {}));

    expect(action).toMatchObject({
      param: {
        locate: {
          optional: true,
        },
      },
    });
    expect(action.description).toContain(
      'Omit locate to operate on the current focus without clicking again',
    );
    expect(JSON.stringify(action)).toContain(
      'especially when copying or cutting an existing text selection',
    );
    expect(action.sample).toContain('"keyName": "Enter"');
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: KeyboardPress
        description: Press a key or key combination, like "Enter", "Tab", "Escape", or "Control+A", "Shift+Enter". Do not use this to type text. Omit locate to operate on the current focus without clicking again, especially for Copy or Cut after text has been selected.
        param:
          locate:
            type: '{ prompt: string /* description of the target element */ }'
            optional: true
            description: The optional element to click before pressing the key. Omit this when the key should operate on the currently focused element, especially when copying or cutting an existing text selection.
          keyName:
            type: string
            description: The key to be pressed. Use '+' for key combinations, e.g., 'Control+A', 'Shift+Enter'
        sample: |-
          <action-type>KeyboardPress</action-type>
          <action-param-json>
          {
            "keyName": "Enter"
          }
          </action-param-json>"
    `);
  });

  it('swipe action explains touch slider use', () => {
    const { actionDescription: action, actionSpaceDescription } =
      buildActionDescriptions(
        defineActionSwipe({
          swipe: async () => {},
          size: async () => ({ width: 1080, height: 2400 }),
        }),
      );

    expect(action.description).toContain(
      'adjust a continuous control such as a slider',
    );
    expect(action.description).toContain(
      'Use "distance" + "direction" for relative movement, or "start" + "end" for precise endpoint movement.',
    );
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: Swipe
        description: Perform a touch gesture for interactions beyond regular scrolling (e.g., adjust a continuous control such as a slider, flip pages in a carousel, dismiss a notification, swipe-to-delete a list item). For regular content scrolling, use Scroll instead. Use "distance" + "direction" for relative movement, or "start" + "end" for precise endpoint movement.
        param:
          start:
            type: '{ prompt: string /* description of the target element */ }'
            optional: true
            description: Starting point of the swipe gesture, if not specified, the center of the page will be used
          direction:
            type: enum('up', 'down', 'left', 'right')
            optional: true
            description: The direction to swipe (required when using distance). The direction means the direction of the finger swipe.
          distance:
            type: number
            optional: true
            description: The distance in pixels to swipe (mutually exclusive with end)
          end:
            type: '{ prompt: string /* description of the target element */ }'
            optional: true
            description: Ending point of the swipe gesture (mutually exclusive with distance)
          duration:
            type: number
            optional: true
            description: Duration of the swipe gesture in milliseconds
            default: 300
          repeat:
            type: number
            optional: true
            description: The number of times to repeat the swipe gesture. 1 for default, 0 for infinite (e.g. endless swipe until the end of the page)
        sample: |-
          <action-type>Swipe</action-type>
          <action-param-json>
          {
            "start": {
              "prompt": "center of the notification"
            },
            "end": {
              "prompt": "upper edge of the screen"
            }
          }
          </action-param-json>"
    `);
  });
});

describe('llm planning - buildActionDescription with ZodEffects and ZodUnion', () => {
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Test action with ZodEffects",
        "param": {
          "value": {
            "type": "string",
          },
        },
        "type": "TestAction",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: TestAction
        description: Test action with ZodEffects
        param:
          value:
            type: string"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Validate email action",
        "param": {
          "email": {
            "type": "string",
          },
        },
        "type": "ValidateEmail",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: ValidateEmail
        description: Validate email action
        param:
          email:
            type: string"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Double the number",
        "param": {
          "count": {
            "description": "Number to be doubled",
            "type": "number",
          },
        },
        "type": "DoubleNumber",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: DoubleNumber
        description: Double the number
        param:
          count:
            type: number
            description: Number to be doubled"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Test union types",
        "param": {
          "value": {
            "type": "string | number",
          },
        },
        "type": "UnionTest",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: UnionTest
        description: Test union types
        param:
          value:
            type: string | number"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Multiple union types",
        "param": {
          "status": {
            "type": "string | number | boolean",
          },
        },
        "type": "MultiUnion",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: MultiUnion
        description: Multiple union types
        param:
          status:
            type: string | number | boolean"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Accepts string or number",
        "param": {
          "input": {
            "description": "Either a string or number",
            "type": "string | number",
          },
        },
        "type": "FlexibleInput",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: FlexibleInput
        description: Accepts string or number
        param:
          input:
            type: string | number
            description: Either a string or number"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Optional email field",
        "param": {
          "optionalEmail": {
            "optional": true,
            "type": "string",
          },
        },
        "type": "OptionalEmail",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: OptionalEmail
        description: Optional email field
        param:
          optionalEmail:
            type: string
            optional: true"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Optional union field",
        "param": {
          "optionalValue": {
            "optional": true,
            "type": "string | number",
          },
        },
        "type": "OptionalUnion",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: OptionalUnion
        description: Optional union field
        param:
          optionalValue:
            type: string | number
            optional: true"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Nullable transform field",
        "param": {
          "nullableTransform": {
            "type": "string",
          },
        },
        "type": "NullableTransform",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: NullableTransform
        description: Nullable transform field
        param:
          nullableTransform:
            type: string"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    // The transform wraps the union, so we should get string | number from the inner union
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Complex field with union and transform",
        "param": {
          "complexField": {
            "type": "string | number",
          },
        },
        "type": "ComplexField",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: ComplexField
        description: Complex field with union and transform
        param:
          complexField:
            type: string | number"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    // Fields with .default() are optional
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Field with default and transform",
        "param": {
          "withDefault": {
            "default": "default",
            "optional": true,
            "type": "string",
          },
        },
        "type": "DefaultTransform",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: DefaultTransform
        description: Field with default and transform
        param:
          withDefault:
            type: string
            optional: true
            default: default"
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

    const { actionDescription: description, actionSpaceDescription } =
      buildActionDescriptions(action);
    expect(description).toMatchInlineSnapshot(`
      {
        "description": "Nested union type",
        "param": {
          "nested": {
            "type": "string | object",
          },
        },
        "type": "NestedUnion",
      }
    `);
    expect(actionSpaceDescription).toMatchInlineSnapshot(`
      "- type: NestedUnion
        description: Nested union type
        param:
          nested:
            type: string | object"
    `);
  });
});
