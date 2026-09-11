import { buildDoubaoPlanningActionOutput } from '@/ai-model/models/doubao/tool-call-serializer';
import {
  buildActionOutputExample,
  createSampleTapAction,
} from '@/ai-model/prompt/planning';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import { describe, expect, it } from '@rstest/core';

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

describe('Doubao planning action output serializer', () => {
  it('serializes primitive and complex parameters using the Seed protocol', () => {
    expect(
      buildDoubaoPlanningActionOutput({
        actionName: 'Example',
        param: {
          text: 'John & Jane',
          count: 2,
          enabled: true,
          options: ['first', 'second'],
          config: { mode: 'fast' },
        },
      }),
    ).toBe(
      '<seed:tool_call><function name="Example"><parameter name="text" string="true">John &amp; Jane</parameter><parameter name="count" string="false">2</parameter><parameter name="enabled" string="false">true</parameter><parameter name="options" string="false">["first","second"]</parameter><parameter name="config" string="false">{"mode":"fast"}</parameter></function></seed:tool_call>',
    );
  });

  it('always serializes a locator prompt and conditionally includes point', () => {
    const sampleTapAction = createSampleTapAction('the Submit button');

    expect(
      buildActionOutputExample(sampleTapAction, {
        buildActionOutput: buildDoubaoPlanningActionOutput,
      }),
    ).toBe(
      '<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><prompt>the Submit button</prompt></parameter></function></seed:tool_call>',
    );
    expect(
      buildActionOutputExample(sampleTapAction, {
        buildActionOutput: buildDoubaoPlanningActionOutput,
        locatePromptSpec: pointPromptSpec,
        locateResultExampleIndex: 1,
      }),
    ).toBe(
      '<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><prompt>the Submit button</prompt><point>402 463</point></parameter></function></seed:tool_call>',
    );
  });

  it('serializes multiple locator fields independently', () => {
    expect(
      buildDoubaoPlanningActionOutput({
        actionName: 'Swipe',
        param: {
          start: { prompt: 'the slider thumb', point: [200, 500] },
          end: { prompt: 'the right end of the slider', point: [800, 500] },
          duration: 300,
        },
        locateFields: ['start', 'end'],
        locateResultKey: 'point',
      }),
    ).toBe(
      '<seed:tool_call><function name="Swipe"><parameter name="start" string="true"><prompt>the slider thumb</prompt><point>200 500</point></parameter><parameter name="end" string="true"><prompt>the right end of the slider</prompt><point>800 500</point></parameter><parameter name="duration" string="false">300</parameter></function></seed:tool_call>',
    );
  });
});
