import { doubaoElementProtocol } from '@/ai-model/models/doubao/element-protocol';
import { buildElementLocateSystemPrompt } from '@/ai-model/prompt/locate';
import { createLocateResultPromptSpec } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { describe, expect, it } from '@rstest/core';

const locatePromptSpec = createLocateResultPromptSpec({
  shape: 'point',
  order: 'xy',
  normalizedBy: 1000,
});
const parseElementResponse = (content: string) =>
  doubaoElementProtocol.parseRawResponse(content, locatePromptSpec);

describe('doubao element locate protocol', () => {
  it('builds the click Function Definition system prompt', () => {
    const prompt = buildElementLocateSystemPrompt({
      systemPromptIntroduction: doubaoElementProtocol.systemPromptIntroduction,
      responseInstructions:
        doubaoElementProtocol.buildResponseInstructions(locatePromptSpec),
    });

    expect(prompt).toContain('## Function Definition');
    const functionDefinition = JSON.parse(
      prompt.split('\n').find((line) => line.startsWith('{')) ?? '',
    );
    expect(functionDefinition).toMatchObject({
      type: 'function',
      name: 'click',
      parameters: {
        required: ['point'],
      },
    });
    expect(prompt).toContain(
      '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>x y</point></parameter></function></seed:tool_call>',
    );
    expect(prompt).toContain(
      '<think_never_used_51bce0c785ca2f68081bfa7d91973934> reasoning process </think_never_used_51bce0c785ca2f68081bfa7d91973934>',
    );
    expect(prompt).toContain('normalized to 0-1000');
    expect(doubaoElementProtocol.expectedJsonObjectResponse).toBe(false);
  });

  it('uses the result adapter coordinate description', () => {
    const locatePromptSpec = createLocateResultPromptSpec({
      shape: 'point',
      order: 'xy',
      normalizedBy: 100,
    });

    const instructions =
      doubaoElementProtocol.buildResponseInstructions(locatePromptSpec);

    expect(instructions).toContain('normalized to 0-100');
    expect(instructions).not.toContain('normalized to 0-1000');
  });

  it('builds the click grounding user prompt', () => {
    const prompt = doubaoElementProtocol.buildUserPrompt('the Submit button');

    expect(prompt).not.toContain('Coordinates');
    expect(prompt).toContain(
      '## User Instruction: What element matches the following task: the Submit button',
    );
  });

  it('parses the click tool call point', () => {
    expect(
      parseElementResponse(
        '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>320 460</point></parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      kind: 'located',
      target: '<point>320 460</point>',
    });
  });

  it('rejects responses that do not follow the click function protocol', () => {
    expect(() => parseElementResponse('No tool call')).toThrow(
      'requires exactly one click function',
    );
    expect(() =>
      parseElementResponse('<function name="Input"></function>'),
    ).toThrow('requires a click function');
    expect(() =>
      parseElementResponse(
        '<parameter name="point" string="true">806 292</parameter>',
      ),
    ).toThrow('requires exactly one click function');
    expect(() => parseElementResponse('<point>123.4 567.8</point>')).toThrow(
      'requires exactly one click function',
    );
  });

  it('preserves the raw point parameter value', () => {
    expect(
      parseElementResponse(
        '<function name="click"><parameter name="point" string="true"><point>320 460</point><point>510 460</point></parameter></function>',
      ),
    ).toEqual({
      kind: 'located',
      target: '<point>320 460</point><point>510 460</point>',
    });
  });

  it('preserves the raw Seed tool call when its inner XML is malformed', () => {
    const response =
      '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>320 460</point></function></seed:tool_call>';

    expect(parseElementResponse(response)).toEqual({
      kind: 'located',
      target: response,
    });
  });

  it('falls back to the raw Seed tool call when a malformed point attribute leaves the parameter empty', () => {
    const response =
      '<seed:tool_call><function name="click"><parameter name="point" point="586 557</point></parameter></function></seed:tool_call>';

    expect(parseElementResponse(response)).toEqual({
      kind: 'located',
      target: response,
    });
  });
});
