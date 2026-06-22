import { parseMaiUiPlanningResponse } from '@/ai-model/models/mai-ui/parser';
import { describe, expect, it } from 'vitest';

describe('parseMaiUiPlanningResponse', () => {
  it('parses thinking and tool_call action', () => {
    const result = parseMaiUiPlanningResponse(`
<thinking>
Click the search icon.
</thinking>
<tool_call>
{"name":"mobile_use","arguments":{"action":"click","coordinate":[120,240]}}
</tool_call>
`);

    expect(result.thinking).toBe('Click the search icon.');
    expect(result.toolCall.name).toBe('mobile_use');
    expect(result.action).toEqual({
      action: 'click',
      coordinate: [120, 240],
    });
  });

  it('accepts </think> style reasoning prefix', () => {
    const result = parseMaiUiPlanningResponse(`
Need to go back.</think>
<tool_call>
{"name":"mobile_use","arguments":{"action":"system_button","button":"back"}}
</tool_call>
`);

    expect(result.thinking).toBe('Need to go back.');
    expect(result.action).toEqual({
      action: 'system_button',
      button: 'back',
    });
  });

  it('throws when tool_call is missing', () => {
    expect(() =>
      parseMaiUiPlanningResponse('<thinking>missing</thinking>'),
    ).toThrow(/Missing <tool_call>/);
  });
});
