import {
  buildActionExample,
  buildPlanningActionOutput,
  createSampleTapAction,
} from '@/ai-model/prompt/planning';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import { getMidsceneLocationSchema } from '@/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('buildPlanningActionOutput', () => {
  it('serializes an action type and structured parameters', () => {
    expect(
      buildPlanningActionOutput({
        type: 'Input',
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
        type: 'Tap',
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

describe('buildActionExample', () => {
  it('builds an action output protocol example', () => {
    const actionExample = buildActionExample({
      name: 'Tap',
      sample: { locate: { prompt: 'the Submit button' } },
    });

    expect(actionExample).toBe(`<action-type>Tap</action-type>
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

    const actionExample = buildActionExample(
      createSampleTapAction('Name input field'),
      {
        locatePromptSpec,
        locateResultExampleIndex: 2,
      },
    );

    expect(actionExample).toContain('"bbox": [120, 180, 380, 210]');
  });

  it('keeps non-locate arrays in standard pretty JSON format', () => {
    const actionExample = buildActionExample(
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

    expect(actionExample).toContain('"bbox": [100, 100, 200, 200]');
    expect(actionExample).toContain(`"offsets": [
    10,
    20
  ]`);
  });
});
