import { createDefaultMidscenePlanningProtocol } from '@/ai-model/model-adapter/default-planning-protocol';
import { getModelAdapter } from '@/ai-model/models';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import { parseStandardPlanningResponse as parseStandardPlanningResponseWithOptions } from '@/ai-model/workflows/planning';
import {
  parseMarkFinishedIndexes,
  parseSubGoalsFromXML,
} from '@/ai-model/workflows/planning/standard-planning-parser';
import { getMidsceneLocationSchema } from '@/common';
import { buildYamlFlowFromPlans } from '@/common';
import { actionInputParamSchema, actionTapParamSchema } from '@/device';
import type { DeviceAction } from '@/types';
import {
  MIDSCENE_USE_DOUBAO_VISION,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const defaultMidscenePlanningProtocol = createDefaultMidscenePlanningProtocol({
  jsonParser: parseModelResponseJson,
});

const parseStandardPlanningResponse = (
  xmlString: string,
  options:
    | {
        includeThought: boolean;
        logSource?: 'model';
      }
    | {
        includeThought: boolean;
        logSource: 'action';
        actionSpace: DeviceAction<any>[];
      } = { includeThought: true },
) =>
  parseStandardPlanningResponseWithOptions(xmlString, {
    ...options,
    actionOutputProtocol: defaultMidscenePlanningProtocol.actionOutputProtocol,
    actionSpace: options.logSource === 'action' ? options.actionSpace : [],
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

  it('adapts doubao locate result to pixel bbox', () => {
    const locateAdapter = getModelAdapter('doubao-vision').locate;
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox_2d: [123, 123, 923, 923] as [number, number, number, number],
    };

    const locatedPixelBbox = locateAdapter.element.resultCodec.toPixelBbox(
      locate.bbox_2d,
      {
        preparedSize: { width: 1000, height: 1000 },
      },
    );
    expect(locatedPixelBbox).toEqual([123, 123, 922, 922]);
  });

  it('throws when adapting an undefined locate value', () => {
    const locateAdapter = getModelAdapter('glm-v').locate;
    if (locateAdapter.kind !== 'standard') {
      throw new Error('glm-v should use standard locate adapter');
    }
    expect(() =>
      locateAdapter.element.resultCodec.toPixelBbox(undefined, {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toThrow(/invalid bbox data/);
  });

  it('clamps normalized locate bbox to content size', () => {
    const locateAdapter = getModelAdapter('glm-v').locate;
    if (locateAdapter.kind !== 'standard') {
      throw new Error('glm-v should use standard locate adapter');
    }
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox: [100, 200, 1000, 1000] as [number, number, number, number],
    };

    const locatedPixelBbox = locateAdapter.element.resultCodec.toPixelBbox(
      locate.bbox,
      {
        preparedSize: { width: 1200, height: 1400 },
        contentSize: { width: 1000, height: 1000 },
      },
    );
    expect(locatedPixelBbox).toEqual([120, 280, 999, 999]);
  });
});

describe('llm planning - action parameters', () => {
  it('parses a primitive action parameter', () => {
    const result = parseStandardPlanningResponse(`
<action-type>CustomAction</action-type>
<action-param-json>"hello world"</action-param-json>
    `);

    expect(result.action).toEqual({
      type: 'CustomAction',
      param: 'hello world',
    });
  });
});

describe('llm planning - build yaml flow', () => {
  it('throws when planned action is not in actionSpace', () => {
    expect(() =>
      buildYamlFlowFromPlans(
        [{ type: 'NonExistentAction', param: {}, thought: '' }],
        [{ name: 'Tap', call: async () => {} }],
      ),
    ).toThrow(/not in the current action space/);
  });

  it('build yaml flow', () => {
    const flow = buildYamlFlowFromPlans(
      [
        {
          type: 'Input',
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
          param: {
            locate: {
              bbox: [300, 300, 400, 400],
              prompt: 'Cancel button',
            },
          },
        },
        {
          type: 'Input',
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

  it('inline single-string shortcut for Terminate/Launch/RunAdbShell/RunHdcShell', () => {
    const flow = buildYamlFlowFromPlans(
      [
        { type: 'Terminate', param: { uri: 'com.mi.car.mobile' } },
        { type: 'Launch', param: { uri: 'com.mi.car.mobile' } },
        { type: 'RunAdbShell', param: { command: 'input keyevent 3' } },
        {
          type: 'RunHdcShell',
          param: { command: 'hidumper -s WindowManagerService -a' },
        },
      ],
      [
        {
          name: 'Terminate',
          interfaceAlias: 'terminate',
          paramSchema: z.object({ uri: z.string() }),
          call: async () => {},
        },
        {
          name: 'Launch',
          interfaceAlias: 'launch',
          paramSchema: z.object({ uri: z.string() }),
          call: async () => {},
        },
        {
          name: 'RunAdbShell',
          interfaceAlias: 'runAdbShell',
          paramSchema: z.object({ command: z.string() }),
          call: async () => {},
        },
        {
          name: 'RunHdcShell',
          interfaceAlias: 'runHdcShell',
          paramSchema: z.object({ command: z.string() }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toEqual([
      { terminate: 'com.mi.car.mobile' },
      { launch: 'com.mi.car.mobile' },
      { runAdbShell: 'input keyevent 3' },
      { runHdcShell: 'hidumper -s WindowManagerService -a' },
    ]);
  });

  it('fallback to expanded format when shortcut action carries extra fields', () => {
    // If a future schema adds a second field (e.g. Terminate.force), we must
    // NOT inline; the player's string-param path would drop the extras.
    const flow = buildYamlFlowFromPlans(
      [
        {
          type: 'Terminate',
          param: { uri: 'com.mi.car.mobile', force: true } as any,
        },
      ],
      [
        {
          name: 'Terminate',
          interfaceAlias: 'terminate',
          paramSchema: z.object({
            uri: z.string(),
            force: z.boolean().optional(),
          }),
          call: async () => {},
        },
      ],
    );
    expect(flow).toEqual([
      { terminate: '', uri: 'com.mi.car.mobile', force: true },
    ]);
  });
});

describe('parseStandardPlanningResponse', () => {
  it('should parse complete XML response with all fields', () => {
    const xml = `
<planning>I need to click the login button</planning>
<memory>User credentials are already filled</memory>
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

    const result = parseStandardPlanningResponse(xml);

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

  it('should parse XML response with only required fields', () => {
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

    const result = parseStandardPlanningResponse(xml);

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

  it('should generate the log from the action in fast mode', () => {
    const xml = `
<planning>This should not be exposed in fast mode</planning>
<log>Tap the button</log>
<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"Button"}}</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml, {
      includeThought: false,
      logSource: 'action',
      actionSpace: [
        {
          name: 'Tap',
          paramSchema: actionTapParamSchema,
          call: vi.fn(),
        },
      ],
    });

    expect(result).not.toHaveProperty('thought');
    expect(result.log).toBe('Tap - locate: Button');
    expect(result.action).toEqual({
      type: 'Tap',
      param: { locate: { prompt: 'Button' } },
    });
  });

  it('should omit locate coordinates from a generated fast log', () => {
    const xml = `
<action-type>Input</action-type>
<action-param-json>{"value":"demo-user","locate":{"prompt":"Username input field","bbox":[375,445,625,505]}}</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml, {
      includeThought: false,
      logSource: 'action',
      actionSpace: [
        {
          name: 'Input',
          paramSchema: actionInputParamSchema,
          call: vi.fn(),
        },
      ],
    });

    expect(result.log).toBe(
      'Input - value: demo-user, locate: Username input field',
    );
  });

  it('should generate the log from a complete response in fast mode', () => {
    const result = parseStandardPlanningResponse(
      '<log>Model-generated completion log</log><complete success="true">done</complete>',
      {
        includeThought: false,
        logSource: 'action',
        actionSpace: [],
      },
    );

    expect(result.log).toBe('Complete - success: true, message: done');
    expect(result.finalizeSuccess).toBe(true);
  });

  it('should generate the log from an error response in fast mode', () => {
    const result = parseStandardPlanningResponse(
      '<log>Model-generated error log</log><error>Button unavailable</error>',
      {
        includeThought: false,
        logSource: 'action',
        actionSpace: [],
      },
    );

    expect(result.log).toBe('Error - Button unavailable');
    expect(result.error).toBe('Button unavailable');
  });

  it('should parse XML response with null action', () => {
    const xml = `
<log>Task completed</log>
<action-type>null</action-type>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      log: 'Task completed',
      action: null,
    });
  });

  it('should parse XML response without action-type', () => {
    const xml = `
<log>Just logging</log>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      log: 'Just logging',
      action: null,
    });
  });

  it('should parse XML response with error field', () => {
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

    const result = parseStandardPlanningResponse(xml);

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
    const xml = `
<log>Waiting</log>
<action-type>Wait</action-type>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      log: 'Waiting',
      action: {
        type: 'Wait',
      },
    });
  });

  it('should handle multiline content in tags', () => {
    const xml = `
<planning>
  This is a complex thought
  spanning multiple lines
</planning>
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

    const result = parseStandardPlanningResponse(xml);

    expect(result.thought).toBe(
      'This is a complex thought\n  spanning multiple lines',
    );
    expect(result.log).toBe('Executing complex action');
    expect(result.action?.type).toBe('Input');
  });

  it('should preserve Input value boundary whitespace while trimming other param strings', () => {
    const xml = `
<log>Type text with boundary spaces</log>
<action-type>Input</action-type>
<action-param-json>
{
  "value": "  test value  ",
  "locate": {
    "prompt": "  input field  "
  }
}
</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.action).toEqual({
      type: 'Input',
      param: {
        value: '  test value  ',
        locate: {
          prompt: 'input field',
        },
      },
    });
  });

  it('should preserve Input value boundary whitespace from JSON code blocks', () => {
    const xml = `
<log>Type text with boundary spaces</log>
<action-type>Input</action-type>
<action-param-json>
\`\`\`json
{
  "value": "  test value  ",
  "locate": {
    "prompt": "  input field  "
  }
}
\`\`\`
</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.action).toEqual({
      type: 'Input',
      param: {
        value: '  test value  ',
        locate: {
          prompt: 'input field',
        },
      },
    });
  });

  it('should preserve Input value boundary whitespace from repaired action params', () => {
    const xml = `
<log>Type text with boundary spaces</log>
<action-type>Input</action-type>
<action-param-json>
{ value: "  test value  ", locate: {" prompt ": "  input field  ",}, }
</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.action).toEqual({
      type: 'Input',
      param: {
        value: '  test value  ',
        locate: {
          prompt: 'input field',
        },
      },
    });
  });

  it('should not throw error when log field is missing and no action', () => {
    const xml = `
<planning>Some thought</planning>
<complete success="true">Task completed</complete>
    `.trim();

    const result = parseStandardPlanningResponse(xml);
    expect(result).toEqual({
      thought: 'Some thought',
      log: '',
      action: null,
      finalizeMessage: 'Task completed',
      finalizeSuccess: true,
    });
  });

  it('should throw error when action-param-json is invalid JSON', () => {
    const xml = `
<log>Action</log>
<action-type>Tap</action-type>
<action-param-json>
{invalid json}
</action-param-json>
    `.trim();

    expect(() => parseStandardPlanningResponse(xml)).toThrow(
      'Failed to parse action-param-json',
    );
  });

  it('should handle case-insensitive tag matching', () => {
    const xml = `
<LOG>Case insensitive log</LOG>
<ACTION-TYPE>Tap</ACTION-TYPE>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.log).toBe('Case insensitive log');
    expect(result.action?.type).toBe('Tap');
  });

  it('should parse half-open action-type tag without closing tag', () => {
    const xml = `
<planning>The Priority input field is active now.</planning>
<log>Type "1000" into the Priority input field</log>
<action-type>Input
<action-param-json>
{
  "value": "1000"
}
</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      thought: 'The Priority input field is active now.',
      log: 'Type "1000" into the Priority input field',
      action: {
        type: 'Input',
        param: {
          value: '1000',
        },
      },
    });
  });

  it('should parse XML with special characters in content', () => {
    const xml = `
<log>Click "Submit" button</log>
<memory>Values: <100 & >50</memory>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "Button with & symbol"
  }
}
</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.log).toBe('Click "Submit" button');
    expect(result.memory).toBe('Values: <100 & >50');
    expect(result.action?.param.locate.prompt).toBe('Button with & symbol');
  });

  it('should parse complete tag with success=true and message', () => {
    const xml = `
<planning>Task completed successfully</planning>
<complete success="true">The product names are: 'Product A', 'Product B', 'Product C'</complete>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      thought: 'Task completed successfully',
      log: '',
      action: null,
      finalizeMessage:
        "The product names are: 'Product A', 'Product B', 'Product C'",
      finalizeSuccess: true,
    });
  });

  it('should parse complete tag with success=false and error message', () => {
    const xml = `
<planning>Task failed</planning>
<complete success="false">Unable to find the required element on the page</complete>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      thought: 'Task failed',
      log: '',
      action: null,
      finalizeMessage: 'Unable to find the required element on the page',
      finalizeSuccess: false,
    });
  });

  it('should parse complete tag with empty message', () => {
    const xml = `
<planning>Task completed</planning>
<complete success="true"></complete>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      thought: 'Task completed',
      log: '',
      action: null,
      finalizeSuccess: true,
    });
  });

  it('should parse complete tag with multiline message', () => {
    const xml = `
<planning>Data extraction completed</planning>
<complete success="true">
Extracted data:
- Item 1: Value A
- Item 2: Value B
- Item 3: Value C
</complete>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      thought: 'Data extraction completed',
      log: '',
      action: null,
      finalizeMessage:
        'Extracted data:\n- Item 1: Value A\n- Item 2: Value B\n- Item 3: Value C',
      finalizeSuccess: true,
    });
  });

  it('should parse complete tag along with other optional fields', () => {
    const xml = `
<planning>All tasks completed successfully</planning>
<memory>Total items processed: 10</memory>
<complete success="true">All 10 items have been processed</complete>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      thought: 'All tasks completed successfully',
      log: '',
      memory: 'Total items processed: 10',
      action: null,
      finalizeMessage: 'All 10 items have been processed',
      finalizeSuccess: true,
    });
  });

  it('should handle complete tag case insensitively', () => {
    const xml = `
<planning>Task done</planning>
<COMPLETE success="true">Success message</COMPLETE>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result).toEqual({
      thought: 'Task done',
      log: '',
      action: null,
      finalizeMessage: 'Success message',
      finalizeSuccess: true,
    });
  });

  it('should parse update-plan-content with sub-goals', () => {
    const xml = `
<planning>Breaking down the task</planning>
<log>Planning the steps</log>
<update-plan-content>
  <sub-goal index="1" status="pending">Log in to the system</sub-goal>
  <sub-goal index="2" status="pending">Complete all to-do items</sub-goal>
  <sub-goal index="3" status="pending">Submit the registration form</sub-goal>
</update-plan-content>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

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
    const xml = `
<planning>First step completed</planning>
<log>Moving to next step</log>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.markFinishedIndexes).toEqual([1]);
  });

  it('should parse multiple finished indexes in mark-sub-goal-done', () => {
    const xml = `
<planning>Multiple steps completed</planning>
<log>Great progress</log>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
  <sub-goal index="2" status="finished" />
</mark-sub-goal-done>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.markFinishedIndexes).toEqual([1, 2]);
  });

  it('should strip trailing XML tags leaked into action-type by LLM', () => {
    // Simulate LLM response where a stray </action-type> appears after </action-param-json>,
    // causing extractXMLTag to include trailing tags in the action type value.
    // e.g. type becomes "KeyboardPress</action-type>\n<action-param-json>..."
    const xml = `
<planning>Need to press Enter</planning>
<log>Press Enter key</log>
<action-type>KeyboardPress</action-type>
<action-param-json>
{
  "keyName": "Enter"
}
</action-param-json>
</action-type>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.action?.type).toBe('KeyboardPress');
    expect(result.action?.param).toEqual({ keyName: 'Enter' });
  });

  it('should parse action params with bare quotes inside prompt strings', () => {
    const xml = `
<planning>Need to locate the search input</planning>
<log>Locating search input</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "搜索输入框，当前显示文本为"世界杯 7 队仍保持不败战绩"",
    "bbox": [120, 200, 780, 260]
  }
}
</action-param-json>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

    expect(result.action?.type).toBe('Tap');
    expect(result.action?.param).toEqual({
      locate: {
        prompt: '搜索输入框，当前显示文本为"世界杯 7 队仍保持不败战绩"',
        bbox: [120, 200, 780, 260],
      },
    });
  });

  it('should parse both update-plan-content and mark-sub-goal-done', () => {
    const xml = `
<planning>Updating plan after progress</planning>
<log>Continuing work</log>
<update-plan-content>
  <sub-goal index="1" status="finished">Log in to the system</sub-goal>
  <sub-goal index="2" status="pending">Complete all to-do items</sub-goal>
</update-plan-content>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
    `.trim();

    const result = parseStandardPlanningResponse(xml);

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
