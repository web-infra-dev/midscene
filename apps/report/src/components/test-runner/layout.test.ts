import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';

const styles = readFileSync(
  new URL('./refinements.less', import.meta.url),
  'utf8',
);
const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const breakdown = readFileSync(
  new URL('./project-breakdown.tsx', import.meta.url),
  'utf8',
);
const inspector = readFileSync(
  new URL('./evidence-inspector.tsx', import.meta.url),
  'utf8',
);

describe('Midscene Test report layout', () => {
  it('keeps lifecycle hover rows square inside the rounded list', () => {
    const baseStyles = readFileSync(
      new URL('./index.less', import.meta.url),
      'utf8',
    );
    expect(baseStyles).toMatch(
      /\.runner-lifecycle-errors\s*\{[^}]*overflow: hidden;/,
    );
    expect(baseStyles).not.toMatch(
      /\.runner-lifecycle-issue\s*\{\s*summary\s*\{[^}]*border-radius:/,
    );
    expect(styles).not.toContain('.runner-project-tree-overview::before');
  });

  it('uses Midscene Test branding in the title and accessible page name', () => {
    expect(source).toContain('<strong>Midscene Test Report</strong>');
    expect(source).toContain('aria-label="Midscene Test report content"');
    expect(source).not.toContain('Test Runner');
  });

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
    expect(breakdown).not.toContain('runner-project-tree-case-cta');
    expect(breakdown).toContain('onClick={() => onOpen(item, failure?.id)}');
  });

  it('uses an icon-only project overview control with an accessible name', () => {
    expect(breakdown).not.toContain('<span>Details</span>');
    expect(breakdown).toContain(
      'aria-label={`Open project overview ${item.project.name}`}',
    );
  });

  it('gives the step description its own full-width row after the actions', () => {
    expect(inspector).toMatch(
      /className="runner-detail-evidence-actions"[\s\S]*?<\/div>\s*\{step.title \? \(\s*<p className="runner-detail-step-description">/,
    );
    expect(styles).toMatch(
      /\.runner-detail-evidence-heading \.runner-detail-step-description\s*\{[^}]*flex: 1 0 100%;/,
    );
  });
});
