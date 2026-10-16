import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { recoveryWarning } from './status-badge';
import { CaseStatus, caseStatusLabel } from './view-primitives';

describe('final outcome and recovery history', () => {
  it('keeps a recovered Case passed and exposes its warning even in compact labels', () => {
    const html = renderToStaticMarkup(
      <CaseStatus status="passed" recovered quiet />,
    );
    expect(html).toContain('>passed</span>');
    expect(html).toContain(`aria-label="${recoveryWarning}"`);
    expect(caseStatusLabel('passed', true)).toBe(
      'passed (earlier attempt failed)',
    );
    expect(html).not.toContain('passed after retry');
  });

  it.each(['passed', 'failed', 'not-run'] as const)(
    'does not invent recovery history for %s',
    (status) => {
      const html = renderToStaticMarkup(<CaseStatus status={status} quiet />);
      expect(html).not.toContain(recoveryWarning);
      expect(caseStatusLabel(status)).toBe(
        status === 'not-run' ? 'not run' : status,
      );
    },
  );

  it('does not show a recovery warning as a successful outcome for a final failure or unexecuted Case', () => {
    for (const status of ['failed', 'not-run'] as const)
      expect(
        renderToStaticMarkup(<CaseStatus status={status} recovered quiet />),
      ).not.toContain(recoveryWarning);
  });
});
