import {
  buildPlanningActionOutput,
  createDefaultMidscenePlanningProtocol,
} from '@/ai-model/model-adapter/default-planning-protocol';
import {
  buildActionOutputExample,
  createSampleTapAction,
} from '@/ai-model/prompt/planning';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import { getMidsceneLocationSchema } from '@/common';
import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';

const defaultMidscenePlanningProtocol = createDefaultMidscenePlanningProtocol({
  jsonParser: parseModelResponseJson,
});

describe('buildPlanningActionOutput', () => {
  it('serializes an action type and structured parameters', () => {
    expect(
      buildPlanningActionOutput({
        actionName: 'Input',
        param: { value: 'john@example.com' },
      }),
    ).toBe(`<action-type>Input</action-type>
<action-param-json>
{
  "value": "john@example.com"
}
</action-param-json>`);
  });

  it('serializes nested locator parameters', () => {
    expect(
      buildPlanningActionOutput({
        actionName: 'Tap',
        param: {
          locate: {
            prompt: 'the Submit button',
            bbox: [100, 200, 300, 400],
          },
        },
      }),
    ).toBe(`<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "the Submit button",
    "bbox": [
      100,
      200,
      300,
      400
    ]
  }
}
</action-param-json>`);
  });
});

describe('buildActionOutputExample', () => {
  const actionOutputProtocol =
    defaultMidscenePlanningProtocol.actionOutputProtocol;
  const buildActionOutput = actionOutputProtocol.buildActionOutput;

  it('builds an action output protocol example', () => {
    const actionOutputExample = buildActionOutputExample(
      {
        name: 'Tap',
        sample: { locate: { prompt: 'the Submit button' } },
      },
      { buildActionOutput },
    );

    expect(actionOutputExample).toBe(`<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "the Submit button"
  }
}
</action-param-json>`);
  });

  it('injects a locate result starting from the requested example index', () => {
    const locatePromptSpec: LocateResultPromptSpec = {
      resultKey: 'bbox',
      resultValueSchema: '[number, number, number, number]',
      resultValueDescription: 'bounding box coordinates',
      resultNoun: 'bounding box',
      resultNounPlural: 'bounding boxes',
      exampleValues: [
        [100, 100, 200, 200],
        [345, 442, 458, 483],
        [120, 180, 380, 210],
      ],
    };

    const actionOutputExample = buildActionOutputExample(
      createSampleTapAction('Name input field'),
      {
        locatePromptSpec,
        locateResultExampleIndex: 2,
        buildActionOutput,
      },
    );

    expect(actionOutputExample).toContain('"bbox": [120, 180, 380, 210]');
  });

  it('keeps non-locate arrays in standard pretty JSON format', () => {
    const actionOutputExample = buildActionOutputExample(
      {
        name: 'TapWithOffsets',
        paramSchema: z.object({
          locate: getMidsceneLocationSchema(),
          offsets: z.array(z.number()),
        }),
        sample: {
          locate: { prompt: 'Name input field' },
          offsets: [10, 20],
        },
      },
      {
        buildActionOutput,
        locatePromptSpec: {
          resultKey: 'bbox',
          resultValueSchema: '[number, number, number, number]',
          resultValueDescription: 'bounding box coordinates',
          resultNoun: 'bounding box',
          resultNounPlural: 'bounding boxes',
          exampleValues: [[100, 100, 200, 200]],
        },
      },
    );

    expect(actionOutputExample).toContain('"bbox": [100, 100, 200, 200]');
    expect(actionOutputExample).toContain(`"offsets": [
    10,
    20
  ]`);
  });
});
