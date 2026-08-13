import { buildActionExample } from '@/ai-model/prompt/planning';
import { describe, expect, it } from 'vitest';

describe('buildActionExample', () => {
  it('builds an action output protocol example', () => {
    const actionExample = buildActionExample({
      name: 'Tap',
      sample: { locate: { prompt: 'the Submit button' } },
      call: async () => {},
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
});
