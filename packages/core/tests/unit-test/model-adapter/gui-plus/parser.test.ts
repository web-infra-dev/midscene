import { parseGuiPlusPlanningResponse } from '@/ai-model/models/gui-plus/parser';
import { describe, expect, it } from 'vitest';

describe('parseGuiPlusPlanningResponse', () => {
  it('parses Action text and tool_call JSON', () => {
    const result = parseGuiPlusPlanningResponse(`Action: Click the submit button.
<tool_call>
{"name":"computer_use","arguments":{"action":"left_click","coordinate":[100,200]}}
</tool_call>`);

    expect(result.actionText).toBe('Click the submit button.');
    expect(result.toolCalls).toEqual([
      {
        name: 'computer_use',
        arguments: {
          action: 'left_click',
          coordinate: [100, 200],
        },
        actionText: 'Click the submit button.',
      },
    ]);
  });

  it('throws when no tool_call block exists', () => {
    expect(() => parseGuiPlusPlanningResponse('Action: wait')).toThrow(
      /No <tool_call> block/,
    );
  });

  it('throws with raw block context for invalid JSON', () => {
    expect(() =>
      parseGuiPlusPlanningResponse(`<tool_call>
{"name":"computer_use","arguments":
</tool_call>`),
    ).toThrow(/Failed to parse GUI-Plus <tool_call>/);
  });
});
