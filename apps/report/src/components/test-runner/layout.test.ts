import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';

const styles = readFileSync(
  new URL('./refinements.less', import.meta.url),
  'utf8',
);
const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

describe('test runner layout', () => {
  it('shares two aligned columns between run metrics and the footer', () => {
    for (const selector of [
      'runner-secondary-metrics',
      'runner-overview-outcome-footer',
    ]) {
      expect(styles).toMatch(
        new RegExp(
          `\\.runner-overview-summary-footer \\.${selector}\\s*\\{[^}]*grid-template-columns: repeat\\(2, minmax\\(0, 1fr\\)\\);`,
        ),
      );
    }
  });

  it('uses the shared status tag spacing', () => {
    expect(styles).toMatch(
      /\.runner-status-badge\.runner-status-pill\s*\{[^}]*padding: 2px 10px;/,
    );
  });

  it('keeps case rows clickable without a separate Inspect affordance', () => {
    expect(source).not.toContain('runner-project-tree-case-cta');
    expect(source).toContain('onClick={() => onOpen(item, failure?.id)}');
  });

  it('gives the step description its own full-width row after the actions', () => {
    expect(source).toMatch(
      /className="runner-detail-evidence-actions"[\s\S]*?<\/div>\s*\{step.title \? \(\s*<p className="runner-detail-step-description">/,
    );
    expect(styles).toMatch(
      /\.runner-detail-evidence-heading \.runner-detail-step-description\s*\{[^}]*flex: 1 0 100%;/,
    );
  });
});
