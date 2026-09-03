import { buildQwenActionDescription } from '@/ai-model/models/qwen/action-space';
import { createQwenPlanningProtocol } from '@/ai-model/models/qwen/planning-protocol';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import { getMidsceneLocationSchema } from '@/common';
import { registerFileChooserAcceptParamSchema } from '@/device';
import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';

const protocol = createQwenPlanningProtocol({
  jsonParser: parseModelResponseJson,
});

describe('Qwen planning protocol', () => {
  it('describes Midscene actions as Qwen function definitions', () => {
    expect(
      protocol.actionSpaceProtocol.buildActionDescription({
        action: {
          name: 'Swipe',
          description: 'Swipe between two elements',
          paramSchema: z.object({
            start: getMidsceneLocationSchema().describe('Start element'),
            end: getMidsceneLocationSchema().describe('End element'),
            duration: z.number().int().optional(),
            direction: z.enum(['up', 'down']),
          }),
          call: async () => undefined,
        },
        locateFieldDescription: 'Use nested prompt and coordinate XML tags.',
      }),
    ).toEqual({
      type: 'function',
      function: {
        name: 'Swipe',
        description: 'Swipe between two elements',
        parameters: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              description:
                'Start element Use nested prompt and coordinate XML tags.',
            },
            end: {
              type: 'string',
              description:
                'End element Use nested prompt and coordinate XML tags.',
            },
            duration: {
              type: 'integer',
              description: 'Parameter duration for Swipe.',
            },
            direction: {
              type: 'string',
              enum: ['up', 'down'],
              description: 'Parameter direction for Swipe.',
            },
          },
          required: ['start', 'end', 'direction'],
        },
      },
    });
  });

  it('builds and parses Qwen text tool calls', () => {
    const actionSpace = [
      {
        name: 'Tap',
        description: 'Tap an element',
        paramSchema: z.object({
          locate: getMidsceneLocationSchema(),
          count: z.number().int().optional(),
        }),
        call: async () => undefined,
      },
    ];
    const actionOutput = protocol.actionOutputProtocol.buildActionOutput({
      actionName: 'Tap',
      param: {
        locate: {
          prompt: 'Submit button',
          point: [320, 460],
        },
        count: 2,
      },
      locateFields: ['locate'],
      locateResultKey: 'point',
    });

    expect(actionOutput).toBe(`<tool_call>
<function=Tap>
<parameter=locate>
<prompt>Submit button</prompt><coordinate>[320,460]</coordinate>
</parameter>
<parameter=count>
2
</parameter>
</function>
</tool_call>`);
    expect(
      protocol.actionOutputProtocol.parseActionOutput(
        `<planning>Tap the submit button</planning>\n${actionOutput}`,
        actionSpace,
      ),
    ).toEqual({
      type: 'Tap',
      param: {
        locate:
          '<prompt>Submit button</prompt><coordinate>[320,460]</coordinate>',
        count: 2,
      },
    });
    expect(
      protocol.actionOutputProtocol.parseRawLocateParameter(
        '<prompt>Submit button</prompt><coordinate>[320,460]</coordinate>',
      ),
    ).toEqual({
      prompt: 'Submit button',
      point: [320, 460],
    });
  });

  it('keeps multiple locator fields separate with nested XML', () => {
    const actionOutput = protocol.actionOutputProtocol.buildActionOutput({
      actionName: 'Swipe',
      param: {
        start: { prompt: 'slider handle', point: [200, 500] },
        end: { prompt: 'right end of slider', point: [800, 500] },
      },
      locateFields: ['start', 'end'],
      locateResultKey: 'point',
    });

    expect(actionOutput).toContain(`<parameter=start>
<prompt>slider handle</prompt><coordinate>[200,500]</coordinate>
</parameter>`);
    expect(actionOutput).toContain(`<parameter=end>
<prompt>right end of slider</prompt><coordinate>[800,500]</coordinate>
</parameter>`);
  });

  it('supports the built-in file chooser string or string array parameter', () => {
    const actionSpace = [
      {
        name: 'RegisterFileChooserAccept',
        description: 'Configure files for a later file chooser',
        paramSchema: registerFileChooserAcceptParamSchema,
        call: async () => undefined,
      },
    ];
    const actionDescription = buildQwenActionDescription({
      action: actionSpace[0],
      locateFieldDescription: '',
    });

    expect(actionDescription.function.parameters.properties.files).toEqual(
      expect.objectContaining({
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      }),
    );
    expect(
      protocol.actionOutputProtocol.parseActionOutput(
        `<tool_call>
<function=RegisterFileChooserAccept>
<parameter=files>["fixtures/a.pdf","fixtures/b.pdf"]</parameter>
</function>
</tool_call>`,
        actionSpace,
      ),
    ).toEqual({
      type: 'RegisterFileChooserAccept',
      param: { files: ['fixtures/a.pdf', 'fixtures/b.pdf'] },
    });
    expect(
      protocol.actionOutputProtocol.parseActionOutput(
        `<tool_call>
<function=RegisterFileChooserAccept>
<parameter=files>fixtures/a.pdf</parameter>
</function>
</tool_call>`,
        actionSpace,
      ),
    ).toEqual({
      type: 'RegisterFileChooserAccept',
      param: { files: 'fixtures/a.pdf' },
    });
  });

  it('supports the iOS RunWdaRequest passthrough data object', () => {
    const actionSpace = [
      {
        name: 'RunWdaRequest',
        description: 'Execute a WebDriverAgent API request',
        paramSchema: z.object({
          method: z.enum(['GET', 'POST', 'DELETE', 'PUT']),
          endpoint: z.string(),
          data: z.object({}).passthrough().optional(),
        }),
        call: async () => undefined,
      },
    ];
    const actionDescription = buildQwenActionDescription({
      action: actionSpace[0],
      locateFieldDescription: '',
    });

    expect(actionDescription.function.parameters.properties.data).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: true,
      }),
    );
    expect(
      protocol.actionOutputProtocol.parseActionOutput(
        `<tool_call>
<function=RunWdaRequest>
<parameter=method>POST</parameter>
<parameter=endpoint>/session/action</parameter>
<parameter=data>{"payload":{"name":"test"},"options":{"timeout":300}}</parameter>
</function>
</tool_call>`,
        actionSpace,
      ),
    ).toEqual({
      type: 'RunWdaRequest',
      param: {
        method: 'POST',
        endpoint: '/session/action',
        data: {
          payload: { name: 'test' },
          options: { timeout: 300 },
        },
      },
    });
  });

  it('supports custom nested objects, arrays, and container unions', () => {
    const actionSpace = [
      {
        name: 'CustomAction',
        description: 'Execute a custom action',
        paramSchema: z.object({
          options: z.object({
            retry: z.number().int(),
            labels: z.array(z.string()),
          }),
          steps: z.array(
            z.object({
              name: z.string(),
              enabled: z.boolean(),
            }),
          ),
          payload: z.union([
            z.object({ value: z.string() }),
            z.array(z.number()),
          ]),
        }),
        call: async () => undefined,
      },
    ];
    const actionDescription = buildQwenActionDescription({
      action: actionSpace[0],
      locateFieldDescription: '',
    });

    expect(actionDescription.function.parameters.properties).toMatchObject({
      options: {
        type: 'object',
        properties: {
          retry: { type: 'integer' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['retry', 'labels'],
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            enabled: { type: 'boolean' },
          },
          required: ['name', 'enabled'],
        },
      },
      payload: {
        anyOf: [
          {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
          },
          { type: 'array', items: { type: 'number' } },
        ],
      },
    });
    expect(
      protocol.actionOutputProtocol.parseActionOutput(
        `<tool_call>
<function=CustomAction>
<parameter=options>{"retry":2,"labels":["primary","safe"]}</parameter>
<parameter=steps>[{"name":"prepare","enabled":true}]</parameter>
<parameter=payload>[10,20]</parameter>
</function>
</tool_call>`,
        actionSpace,
      ),
    ).toEqual({
      type: 'CustomAction',
      param: {
        options: { retry: 2, labels: ['primary', 'safe'] },
        steps: [{ name: 'prepare', enabled: true }],
        payload: [10, 20],
      },
    });
  });

  it('returns no action when a tool call is absent', () => {
    expect(
      protocol.actionOutputProtocol.parseActionOutput(
        '<complete success="true">Done</complete>',
        [],
      ),
    ).toBeNull();
  });
});
