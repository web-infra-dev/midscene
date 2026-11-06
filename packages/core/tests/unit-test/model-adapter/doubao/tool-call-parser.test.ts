import {
  parseDoubaoToolCall,
  parseDoubaoToolCalls,
} from '@/ai-model/models/doubao/tool-call-parser';
import { describe, expect, it } from '@rstest/core';

describe('Doubao tool call parser', () => {
  it('parses XML structure while preserving raw parameter values', () => {
    expect(
      parseDoubaoToolCall(
        '<seed:tool_call><function name="Example"><parameter name="text" string="true">John &amp; Jane</parameter><parameter name="options" string="false">[1,2]</parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      functionName: 'Example',
      parameters: [
        {
          name: 'text',
          isString: true,
          rawValue: 'John &amp; Jane',
        },
        {
          name: 'options',
          isString: false,
          rawValue: '[1,2]',
        },
      ],
    });
  });

  it('returns null when no function call is present', () => {
    expect(
      parseDoubaoToolCall('<complete success="true">Done</complete>'),
    ).toBeNull();
  });

  it('preserves a missing string attribute on point parameters', () => {
    expect(
      parseDoubaoToolCall(
        '<seed:tool_call><function name="click"><parameter name="point"><point>500 600</point></parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      functionName: 'click',
      parameters: [
        {
          name: 'point',
          isString: undefined,
          rawValue: '<point>500 600</point>',
        },
      ],
    });
  });

  it('preserves a missing string attribute on other parameters', () => {
    expect(
      parseDoubaoToolCall(
        '<seed:tool_call><function name="Input"><parameter name="value">John</parameter></function></seed:tool_call>',
      ),
    ).toEqual({
      functionName: 'Input',
      parameters: [
        {
          name: 'value',
          isString: undefined,
          rawValue: 'John',
        },
      ],
    });
  });

  it('rejects an invalid string attribute', () => {
    expect(() =>
      parseDoubaoToolCall(
        '<seed:tool_call><function name="Input"><parameter name="value" string="yes">John</parameter></function></seed:tool_call>',
      ),
    ).toThrow('parameter requires a valid string attribute');
  });

  it('parses multiple Seed tool call blocks in their output order', () => {
    expect(
      parseDoubaoToolCalls(
        '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>320 460</point></parameter></function></seed:tool_call>' +
          '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>510 460</point></parameter></function></seed:tool_call>',
      ),
    ).toEqual([
      {
        functionName: 'click',
        parameters: [
          {
            name: 'point',
            isString: true,
            rawValue: '<point>320 460</point>',
          },
        ],
      },
      {
        functionName: 'click',
        parameters: [
          {
            name: 'point',
            isString: true,
            rawValue: '<point>510 460</point>',
          },
        ],
      },
    ]);
  });

  it('parses multiple functions inside one Seed tool call block', () => {
    expect(
      parseDoubaoToolCalls(
        '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>320 460</point></parameter></function><function name="click"><parameter name="point" string="true"><point>510 460</point></parameter></function></seed:tool_call>',
      ),
    ).toHaveLength(2);
  });

  it('parses a function when the surrounding Seed tool call is malformed', () => {
    expect(
      parseDoubaoToolCall(
        '<function name="click"><parameter name="point" string="true"><point>320 460</point></parameter></function>',
      ),
    ).toEqual({
      functionName: 'click',
      parameters: [
        {
          name: 'point',
          isString: true,
          rawValue: '<point>320 460</point>',
        },
      ],
    });
  });
});
