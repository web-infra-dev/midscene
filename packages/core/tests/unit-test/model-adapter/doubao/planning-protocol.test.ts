import { createDoubaoPlanningProtocol } from '@/ai-model/models/doubao/planning-protocol';
import {
  buildStandardPlanningSystemPrompt,
  createSampleTapAction,
} from '@/ai-model/prompt/planning';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import { describe, expect, it } from 'vitest';

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

describe('Doubao planning prompt', () => {
  const tapAction = {
    ...createSampleTapAction('the Submit button'),
    description: 'Tap an element',
    call: async () => {},
  };

  it('renders Function Definition, response start and Seed examples', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      actionSpace: [tapAction],
      includeLocateInPlanning: true,
      locatePromptSpec: pointPromptSpec,
      planningProtocol,
    });

    expect(prompt).toContain('### Function Definition');
    expect(prompt).toContain('"name":"Tap"');
    expect(prompt).toContain(
      `<think_never_used_51bce0c785ca2f68081bfa7d91973934>
reasoning process
</think_never_used_51bce0c785ca2f68081bfa7d91973934>`,
    );
    expect(prompt).not.toContain('Every response MUST begin');
    expect(prompt).toContain(
      '<prompt>Add to cart button for Sauce Labs Backpack</prompt><point>402 463</point>',
    );
    expect(prompt).toContain('<complete success="true|false">');
    expect(prompt).not.toContain('<action-type>');
    expect(prompt).not.toContain('<action-param-json>');
  });

  it('keeps locator prompt but omits point when planning does not locate', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      actionSpace: [tapAction],
      includeLocateInPlanning: false,
      planningProtocol,
    });

    expect(prompt).toContain(
      '<parameter name="locate" string="true"><prompt>Add to cart button for Sauce Labs Backpack</prompt></parameter>',
    );
    expect(prompt).not.toContain(
      '<prompt>Add to cart button for Sauce Labs Backpack</prompt><point>',
    );
  });
});
