import { doubaoSearchAreaProtocol } from '@/ai-model/models/doubao/area-protocol';
import { createLocateResultPromptSpec } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { describe, expect, it } from '@rstest/core';

const locatePromptSpec = createLocateResultPromptSpec({
  shape: 'point',
  order: 'xy',
  normalizedBy: 1000,
});
const parseSearchAreaResponse = (content: string) =>
  doubaoSearchAreaProtocol.parseRawResponse(content, locatePromptSpec);

describe('doubao search-area locate protocol', () => {
  it('builds instructions that distinguish target and references', () => {
    const instructions =
      doubaoSearchAreaProtocol.buildResponseInstructions(locatePromptSpec);

    expect(doubaoSearchAreaProtocol.systemPromptIntroduction).toContain(
      'You are a GUI grounding agent.',
    );
    expect(instructions).toContain(
      'Locate exactly one target element that the user ultimately wants to operate.',
    );
    expect(instructions).toContain(
      'A response containing only the target is invalid when the description uses any visible element to identify the target.',
    );
    expect(instructions).toContain(
      'For the description "the price in the row whose product name is Tomato"',
    );
    expect(instructions).toContain(
      'For the description "the plus button between the Start and End nodes"',
    );
    const functionDefinition = JSON.parse(
      instructions.split('\n').find((line) => line.startsWith('{')) ?? '',
    );
    expect(functionDefinition).toMatchObject({
      name: 'click',
      parameters: {
        properties: {
          role: {
            type: 'string',
            enum: ['target', 'reference'],
          },
        },
        required: ['role', 'point'],
      },
    });
    expect(instructions).toContain(
      '<parameter name="role" string="true">target</parameter>',
    );
    expect(instructions).toContain(
      '<parameter name="role" string="true">reference</parameter>',
    );
    expect(instructions.match(/<seed:tool_call><function/g)).toHaveLength(5);
    expect(instructions).toContain('normalized to 0-1000');
    expect(doubaoSearchAreaProtocol.expectedJsonObjectResponse).toBe(false);
    expect(
      doubaoSearchAreaProtocol.buildUserPrompt('the edit icon near Apollo'),
    ).toBe(
      'Locate the target and all visible reference elements used to identify it: the edit icon near Apollo',
    );
  });

  it('parses clicks by their explicit roles', () => {
    expect(
      parseSearchAreaResponse(
        '<seed:tool_call><function name="click"><parameter name="role" string="true">reference</parameter><parameter name="point" string="true"><point>510 460</point></parameter></function></seed:tool_call>' +
          '<seed:tool_call><function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>320 460</point></parameter></function></seed:tool_call>' +
          '<seed:tool_call><function name="click"><parameter name="role" string="true">reference</parameter><parameter name="point" string="true"><point>680 460</point></parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      kind: 'located',
      target: '<point>320 460</point>',
      references: ['<point>510 460</point>', '<point>680 460</point>'],
    });
  });

  it('parses a target without references', () => {
    expect(
      parseSearchAreaResponse(
        '<seed:tool_call><function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>320 460</point></parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      kind: 'located',
      target: '<point>320 460</point>',
    });
  });

  it('preserves multiple points inside one point parameter', () => {
    expect(
      parseSearchAreaResponse(
        '<function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>320 460</point><point>510 460</point></parameter></function>',
      ),
    ).toEqual({
      kind: 'located',
      target: '<point>320 460</point><point>510 460</point>',
    });
  });

  it('does not require the role parameter to be marked as a string', () => {
    expect(
      parseSearchAreaResponse(
        '<function name="click"><parameter name="role">target</parameter><parameter name="point" string="true"><point>320 460</point></parameter></function>',
      ),
    ).toEqual({
      kind: 'located',
      target: '<point>320 460</point>',
    });
  });

  it('ignores unrecognized roles', () => {
    expect(
      parseSearchAreaResponse(
        '<function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>320 460</point></parameter></function>' +
          '<function name="click"><parameter name="role" string="true">candidate</parameter><parameter name="point" string="true"><point>510 460</point></parameter></function>',
      ),
    ).toEqual({
      kind: 'located',
      target: '<point>320 460</point>',
    });
  });

  it('rejects missing or duplicate roles and duplicate targets', () => {
    expect(() =>
      parseSearchAreaResponse(
        '<function name="click"><parameter name="point" string="true"><point>320 460</point></parameter></function>',
      ),
    ).toThrow('requires exactly one role parameter');
    expect(() =>
      parseSearchAreaResponse(
        '<function name="click"><parameter name="role" string="true">target</parameter><parameter name="role" string="true">reference</parameter><parameter name="point" string="true"><point>320 460</point></parameter></function>',
      ),
    ).toThrow('requires exactly one role parameter');
    expect(() =>
      parseSearchAreaResponse(
        '<function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>320 460</point></parameter></function>' +
          '<function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>510 460</point></parameter></function>',
      ),
    ).toThrow('requires exactly one target click function');
  });

  it('preserves the raw Seed tool call when its inner XML is malformed', () => {
    const response =
      '<seed:tool_call><function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>320 460</point></function></seed:tool_call>';

    expect(parseSearchAreaResponse(response)).toEqual({
      kind: 'located',
      target: response,
    });
  });
});
