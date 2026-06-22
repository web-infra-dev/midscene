import {
  parseManoCuaActionCall,
  parseManoCuaPlanningResponse,
} from '@/ai-model/models/mano-cua/parser';
import { describe, expect, it } from 'vitest';

describe('parseManoCuaPlanningResponse', () => {
  it('parses think, action description, and action call', () => {
    const result = parseManoCuaPlanningResponse(`
<think>The search bar is at the top.</think>
<action_desp>Click the search bar to focus it</action_desp>
<action>click(start_box='<|box_start|>(500,38)<|box_end|>')</action>
`);

    expect(result.think).toBe('The search bar is at the top.');
    expect(result.actionDescription).toBe('Click the search bar to focus it');
    expect(result.action).toEqual({
      name: 'click',
      args: {
        start_box: '<|box_start|>(500,38)<|box_end|>',
      },
      rawAction: "click(start_box='<|box_start|>(500,38)<|box_end|>')",
    });
  });

  it('parses multi-argument actions', () => {
    const result = parseManoCuaActionCall(
      "scroll(start_box='<|box_start|>(200,300)<|box_end|>', direction='down', amount='3')",
    );

    expect(result).toEqual({
      name: 'scroll',
      args: {
        start_box: '<|box_start|>(200,300)<|box_end|>',
        direction: 'down',
        amount: '3',
      },
      rawAction:
        "scroll(start_box='<|box_start|>(200,300)<|box_end|>', direction='down', amount='3')",
    });
  });

  it('throws when action tag is missing', () => {
    expect(() =>
      parseManoCuaPlanningResponse('<think>missing</think>'),
    ).toThrow(/Missing <action>/);
  });
});
