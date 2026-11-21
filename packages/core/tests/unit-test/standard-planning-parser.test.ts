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

  it('reads every tag after planning text that contains a dotted capital I', () => {
    const xml = `<planning>İlk adım tamam. İleri, İptal ve İşlem düğmeleri görünüyor; İleri düğmesine dokunacağım.</planning>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
<memory>İleri düğmesi sağ altta</memory>
<log>Tap the İleri button</log>
<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"İleri button"}}</action-param-json>`;

    expect(
      parseXMLPlanningResponse(xml, ['action-type', 'action-param-json'], {
        includeThought: true,
      }).parsed,
    ).toEqual({
      thought:
        'İlk adım tamam. İleri, İptal ve İşlem düğmeleri görünüyor; İleri düğmesine dokunacağım.',
      markFinishedIndexes: [1],
      memory: 'İleri düğmesi sağ altta',
      log: 'Tap the İleri button',
    });
  });
});
