import {
  createDoubaoPlanningActionOutputParser,
  parseDoubaoRawLocateParameter,
} from '@/ai-model/models/doubao/action-output-parser';
import { createDoubaoPlanningProtocol } from '@/ai-model/models/doubao/planning-protocol';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import { parseStandardPlanningResponse } from '@/ai-model/workflows/planning';
import { getMidsceneLocationSchema } from '@/common';
import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';

const actionOutputProtocol = createDoubaoPlanningProtocol({
  jsonParser: parseModelResponseJson,
}).actionOutputProtocol;

describe('Doubao planning action output parser', () => {
  const parseActionOutputWithActionSpace =
    createDoubaoPlanningActionOutputParser(parseModelResponseJson);
  const parseActionOutput = (content: string) =>
    parseActionOutputWithActionSpace(content, []);

  it('parses primitive, complex and locator parameters', () => {
    const content =
      '<seed:tool_call><function name="Example"><parameter name="text" string="true">John &amp; Jane</parameter><parameter name="count" string="false">2</parameter><parameter name="options" string="false">["first","second"]</parameter><parameter name="locate" string="true"><prompt>Submit &amp; Continue</prompt><point>500 600</point></parameter></function></seed:tool_call>';

    expect(parseActionOutput(content)).toEqual({
      type: 'Example',
      param: {
        text: 'John &amp; Jane',
        count: 2,
        options: ['first', 'second'],
        locate: '<prompt>Submit &amp; Continue</prompt><point>500 600</point>',
      },
    });
  });

  it('keeps prompt-only and official point-only parameters as strings', () => {
    expect(
      parseActionOutput(
        '<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><prompt>Submit</prompt></parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      type: 'Tap',
      param: { locate: '<prompt>Submit</prompt>' },
    });
    expect(
      parseActionOutput(
        '<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><point>500 600</point></parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      type: 'Tap',
      param: { locate: '<point>500 600</point>' },
    });
  });

  it('uses the adapter JSON parser for non-string parameters', () => {
    const jsonParser = rs.fn(() => ['parsed']);
    const parser = createDoubaoPlanningActionOutputParser(jsonParser);

    expect(
      parser(
        '<seed:tool_call><function name="Example"><parameter name="options" string="false">[1,2]</parameter></function></seed:tool_call>',
        [],
      ),
    ).toEqual({ type: 'Example', param: { options: ['parsed'] } });
    expect(jsonParser).toHaveBeenCalledWith('[1,2]', {
      source: 'planning-action-param',
    });
  });

  it('does not parse locator tags when the parameter is not a string', () => {
    const jsonParser = rs.fn(() => ({ parsedBy: 'jsonParser' }));
    const parser = createDoubaoPlanningActionOutputParser(jsonParser);

    expect(
      parser(
        '<seed:tool_call><function name="Example"><parameter name="locate" string="false"><point>500 600</point></parameter></function></seed:tool_call>',
        [],
      ),
    ).toEqual({
      type: 'Example',
      param: { locate: { parsedBy: 'jsonParser' } },
    });
    expect(jsonParser).toHaveBeenCalledWith('<point>500 600</point>', {
      source: 'planning-action-param',
    });
  });

  it('uses the action schema when the string attribute is missing', () => {
    const content =
      '<seed:tool_call><function name="Example"><parameter name="text">John</parameter><parameter name="count">2</parameter><parameter name="enabled">true</parameter><parameter name="direction">down</parameter><parameter name="options">{"duration":300}</parameter><parameter name="locate"><prompt>Submit</prompt><point>500 600</point></parameter></function></seed:tool_call>';
    const actionSpace = [
      {
        name: 'Example',
        paramSchema: z.object({
          text: z.string(),
          count: z.number(),
          enabled: z.boolean(),
          direction: z.enum(['up', 'down']),
          options: z.object({ duration: z.number() }),
          locate: getMidsceneLocationSchema(),
        }),
        call: rs.fn(),
      },
    ];

    expect(parseActionOutputWithActionSpace(content, actionSpace)).toEqual({
      type: 'Example',
      param: {
        text: 'John',
        count: 2,
        enabled: true,
        direction: 'down',
        options: { duration: 300 },
        locate: '<prompt>Submit</prompt><point>500 600</point>',
      },
    });
  });

  it('returns null when no Seed tool call is present', () => {
    expect(
      parseActionOutput('<complete success="true">Done</complete>'),
    ).toBeNull();
  });

  it('keeps completion dependent on the Midscene complete tag', () => {
    expect(
      parseStandardPlanningResponse(
        '<complete success="true">Done</complete>',
        {
          includeThought: true,
          actionOutputProtocol,
          actionSpace: [],
        },
      ),
    ).toEqual({
      log: '',
      finalizeMessage: 'Done',
      finalizeSuccess: true,
      action: null,
    });
    expect(
      parseStandardPlanningResponse('Finished without a tool call', {
        includeThought: true,
        actionOutputProtocol,
        actionSpace: [],
      }),
    ).toEqual({
      log: '',
      action: null,
    });
  });

  it('composes with the standard planning parser', () => {
    const content = `<planning>Tap the target</planning>
<log>Tap the Submit button</log>
<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><prompt>the Submit button</prompt><point>500 600</point></parameter></function></seed:tool_call>`;

    expect(
      parseStandardPlanningResponse(content, {
        includeThought: true,
        actionOutputProtocol,
        actionSpace: [],
      }),
    ).toEqual({
      thought: 'Tap the target',
      log: 'Tap the Submit button',
      action: {
        type: 'Tap',
        param: {
          locate: '<prompt>the Submit button</prompt><point>500 600</point>',
        },
      },
    });
  });
});

describe('Doubao planning raw locator parameter parser', () => {
  it('parses prompt and point after the action space identifies a locator field', () => {
    expect(
      parseDoubaoRawLocateParameter(
        '<prompt>Submit &amp; Continue</prompt><point>500 600</point>',
      ),
    ).toEqual({
      prompt: 'Submit &amp; Continue',
      point: '<point>500 600</point>',
    });
  });

  it('parses prompt-only and official point-only forms', () => {
    expect(parseDoubaoRawLocateParameter('<prompt>Submit</prompt>')).toEqual({
      prompt: 'Submit',
    });
    expect(parseDoubaoRawLocateParameter('<point>500 600</point>')).toEqual({
      point: '<point>500 600</point>',
    });
  });

  it('preserves multiple raw point values for the result codec', () => {
    expect(
      parseDoubaoRawLocateParameter(
        '<prompt>Submit</prompt><point>500 600</point><point>700 800</point>',
      ),
    ).toEqual({
      prompt: 'Submit',
      point: '<point>500 600</point><point>700 800</point>',
    });
  });
});
