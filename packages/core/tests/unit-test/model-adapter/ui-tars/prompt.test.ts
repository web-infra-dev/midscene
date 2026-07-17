import {
  getSummary,
  getUiTarsPlanningPrompt,
} from '@/ai-model/models/ui-tars/prompt';
import * as sharedEnvActual from '@midscene/shared/env' with {
  rstest: 'importActual',
};
import { describe, expect, it, rs } from '@rstest/core';
import { mockNonChinaTimeZone, restoreIntl } from '../../mocks/intl-mock';

rs.mock('@midscene/shared/env', () => ({
  ...sharedEnvActual,
  getPreferredLanguage: rs.fn().mockReturnValue('English'),
}));

describe('ui-tars prompt', () => {
  it('renders UI-TARS planning prompt', () => {
    mockNonChinaTimeZone();

    const prompt = getUiTarsPlanningPrompt();
    expect(prompt).toMatchSnapshot();

    restoreIntl();
  });

  it('extracts summary from prediction text', () => {
    const text = `Reflection: Previous steps completed
Action_Summary: Click submit button
Action: click(start_box='(100,200,300,400)')`;

    const summary = getSummary(text);
    expect(summary).toBe(
      "Action_Summary: Click submit button\nAction: click(start_box='(100,200,300,400)')",
    );
  });

  it('keeps text without reflection unchanged', () => {
    const text = `Action_Summary: Type username
Action: type(content='user')`;

    const summary = getSummary(text);
    expect(summary).toBe(text);
  });
});
