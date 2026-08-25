import { parseXMLPlanningResponse } from '@/ai-model/workflows/planning';
import { describe, expect, it } from '@rstest/core';

describe('parseXMLPlanningResponse', () => {
  it('extracts the continuous content between the protocol boundary tags', () => {
    const xml = `<planning>Choose the next action</planning>
<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"Submit"}}</action-param-json>
<memory>Keep this outside the action output</memory>`;

    expect(
      parseXMLPlanningResponse(xml, ['action-type', 'action-param-json'], {
        includeThought: true,
      }).rawActionOutput,
    ).toBe(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"Submit"}}</action-param-json>`);
  });
});
