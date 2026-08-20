import {
  buildDoubaoActionDescription,
  buildDoubaoLocateFieldDescription,
} from '@/ai-model/models/doubao/action-space';
import { createDoubaoPlanningProtocol } from '@/ai-model/models/doubao/planning-protocol';
import { serializeActionDescriptions } from '@/ai-model/prompt/planning';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import {
  actionInputParamSchema,
  registerFileChooserAcceptParamSchema,
} from '@/device';
import { getMidsceneLocationSchema } from '@/index';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const pointPromptSpec: LocateResultPromptSpec = {
  resultKey: 'point',
  resultValueSchema: '[number, number]',
  resultValueDescription: 'point coordinates in the 0-1000 range',
  resultNoun: 'point',
  resultNounPlural: 'points',
  exampleValues: [
    [150, 150],
    [402, 463],
  ],
};

const planningProtocol = createDoubaoPlanningProtocol({
  jsonParser: parseModelResponseJson,
});

describe('Doubao Function Definition', () => {
  it('builds an empty parameters definition for an action without params', () => {
    expect(
      buildDoubaoActionDescription({
        action: {
          name: 'Reload',
          description: 'Reload the current page',
          call: async () => {},
        },
        locateFieldDescription: buildDoubaoLocateFieldDescription(),
      }),
    ).toEqual({
      name: 'Reload',
      description: 'Reload the current page',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    });
  });

  it('builds JSONL with locator, enum and integer fields', () => {
    const locateFieldDescription =
      buildDoubaoLocateFieldDescription(pointPromptSpec);
    const action = {
      name: 'Swipe',
      description: 'Swipe from an element in a direction',
      paramSchema: z.object({
        locate: getMidsceneLocationSchema().describe(
          'The swipe starting point',
        ),
        direction: z.enum(['up', 'down']),
        duration: z.number().int().optional(),
      }),
      call: async () => {},
    };
    const description = buildDoubaoActionDescription({
      action,
      locateFieldDescription,
    });

    expect(description).toEqual({
      name: 'Swipe',
      description: 'Swipe from an element in a direction',
      parameters: {
        type: 'object',
        properties: {
          locate: {
            type: 'string',
            description:
              'The swipe starting point The format is: <prompt>element description</prompt><point>x y</point>. point coordinates in the 0-1000 range',
          },
          direction: {
            type: 'string',
            description: 'Parameter direction for Swipe.',
            enum: ['up', 'down'],
          },
          duration: {
            type: 'integer',
            description: 'Parameter duration for Swipe.',
          },
        },
        required: ['locate', 'direction'],
      },
    });
    expect(
      serializeActionDescriptions(
        [description],
        planningProtocol.actionSpaceProtocol.format,
      ),
    ).toBe(JSON.stringify(description));
  });

  it('preserves union types from built-in action schemas', () => {
    const locateFieldDescription = buildDoubaoLocateFieldDescription();
    const inputDescription = buildDoubaoActionDescription({
      action: {
        name: 'Input',
        description: 'Input the value into the element',
        paramSchema: actionInputParamSchema,
        call: async () => {},
      },
      locateFieldDescription,
    });
    const fileChooserDescription = buildDoubaoActionDescription({
      action: {
        name: 'RegisterFileChooserAccept',
        description: 'Configure files for file chooser dialogs',
        paramSchema: registerFileChooserAcceptParamSchema,
        call: async () => {},
      },
      locateFieldDescription,
    });

    expect(inputDescription.parameters.properties.value.type).toEqual([
      'string',
      'number',
    ]);
    expect(fileChooserDescription.parameters.properties.files.type).toEqual([
      'string',
      'array',
    ]);
  });
});
