import {
  getSummary,
  getUiTarsPlanningPrompt,
} from '@/ai-model/models/ui-tars/prompt';
import { describe, expect, it, vi } from 'vitest';
import { mockNonChinaTimeZone, restoreIntl } from '../../mocks/intl-mock';

vi.mock('@midscene/shared/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@midscene/shared/env')>();
  return {
    ...actual,
    getPreferredLanguage: vi.fn().mockReturnValue('English'),
  };
});

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
