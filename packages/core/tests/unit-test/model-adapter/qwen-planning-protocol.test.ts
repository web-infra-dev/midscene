import { createQwenComputerUsePlanningProtocol } from '@/ai-model/models/qwen-planning-protocol';
import {
  buildPlanningActionSpaceDescription,
  buildStandardPlanningSystemPrompt,
} from '@/ai-model/prompt/planning';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import type { DeviceAction } from '@/types';
import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';

const actionSpace: DeviceAction<any>[] = [
  {
    name: 'Tap',
    description: 'Tap a UI element',
    paramSchema: z.object({
      locate: z.object({
        prompt: z.string(),
      }),
    }),
    sample: {
      locate: {
        prompt: 'the Submit button',
      },
    },
    call: async () => {},
  },
  {
    name: 'Input',
    description: 'Input text into the focused element',
    paramSchema: z.object({
      value: z.string(),
    }),
    sample: {
      value: 'hello',
    },
    call: async () => {},
  },
];

const planningProtocol = createQwenComputerUsePlanningProtocol({
  jsonParser: parseModelResponseJson,
});
const actionOutputProtocol = planningProtocol.actionOutputProtocol;

describe('Qwen computer_use planning protocol', () => {
  it('builds one computer_use tool definition from Midscene actions', () => {
    const description = buildPlanningActionSpaceDescription({
      actionSpace,
      planningProtocol,
    });
    const toolDefinition = JSON.parse(
      description.replace(/^<tools>\n/, '').replace(/\n<\/tools>$/, ''),
    );

    expect(toolDefinition.function.name).toBe('computer_use');
    expect(toolDefinition.function.parameters.properties.action.enum).toEqual([
      'Tap',
      'Input',
    ]);
    expect(
      toolDefinition.function.parameters.properties.action.description,
    ).toContain('"type": "Tap"');
    expect(
      toolDefinition.function.parameters.properties.action.description,
    ).toContain('<tool_call>');
    expect(description).not.toContain('left_click');
  });

  it('injects the dynamic tool definition into the Midscene planning prompt', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      actionSpace,
      includeLocateInPlanning: false,
      planningProtocol,
    });

    expect(prompt).toContain('### Tools\n\n<tools>');
    expect(prompt).toContain('"name": "computer_use"');
    expect(prompt).toContain('<function=computer_use>');
    expect(prompt).not.toContain('<action-type>');
    expect(prompt).toContain('<complete success="true|false">');
  });

  it('builds and parses Qwen tool_call output without translating the action', () => {
    const output = actionOutputProtocol.buildActionOutput({
      actionName: 'Tap',
      param: {
        locate: {
          prompt: 'the Submit button',
        },
      },
    });

    expect(output).toBe(`<tool_call>
<function=computer_use>
<parameter=action>
Tap
</parameter>
<parameter=param>
{
  "locate": {
    "prompt": "the Submit button"
  }
}
</parameter>
</function>
</tool_call>`);
    expect(actionOutputProtocol.parseActionOutput(output, actionSpace)).toEqual(
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'the Submit button',
          },
        },
      },
    );
  });

  it('preserves whitespace and unicode in Midscene Input values', () => {
    const output = actionOutputProtocol.buildActionOutput({
      actionName: 'Input',
      param: {
        value: '  上海\nQwen 3.7  ',
      },
    });

    expect(actionOutputProtocol.parseActionOutput(output, actionSpace)).toEqual(
      {
        type: 'Input',
        param: {
          value: '  上海\nQwen 3.7  ',
        },
      },
    );
  });

  it('returns no action when no tool call is present', () => {
    expect(actionOutputProtocol.parseActionOutput('', actionSpace)).toBeNull();
  });

  it.each([
    [
      'an unknown function',
      `<tool_call>
<function=other_tool>
<parameter=action>Tap</parameter>
<parameter=param>{}</parameter>
</function>
</tool_call>`,
      'Unsupported Qwen tool call function',
    ],
    [
      'an action outside the Midscene action space',
      `<tool_call>
<function=computer_use>
<parameter=action>left_click</parameter>
<parameter=param>{}</parameter>
</function>
</tool_call>`,
      "Action type 'left_click' is not in the current action space",
    ],
    [
      'multiple tool calls',
      `<tool_call>
<function=computer_use>
<parameter=action>Tap</parameter>
<parameter=param>{}</parameter>
</function>
</tool_call>
<tool_call>
<function=computer_use>
<parameter=action>Input</parameter>
<parameter=param>{"value":"hello"}</parameter>
</function>
</tool_call>`,
      'Expected exactly one <tool_call> block',
    ],
    [
      'a malformed param object',
      `<tool_call>
<function=computer_use>
<parameter=action>Tap</parameter>
<parameter=param>[]</parameter>
</function>
</tool_call>`,
      'Failed to parse Qwen tool call param',
    ],
  ])('rejects %s', (_caseName, output, expectedError) => {
    expect(() =>
      actionOutputProtocol.parseActionOutput(output, actionSpace),
    ).toThrow(expectedError);
  });
});
