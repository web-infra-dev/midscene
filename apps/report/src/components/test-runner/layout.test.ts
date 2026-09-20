import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';

const styles = readFileSync(
  new URL('./refinements.less', import.meta.url),
  'utf8',
);
const figmaStyles = readFileSync(
  new URL('./figma-layout.less', import.meta.url),
  'utf8',
);
const figmaEvidenceStyles = readFileSync(
  new URL('./figma-evidence.less', import.meta.url),
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
const filters = readFileSync(
  new URL('./case-filters.tsx', import.meta.url),
  'utf8',
);
const header = readFileSync(
  new URL('./case-workspace-header.tsx', import.meta.url),
  'utf8',
);
const attemptSelect = readFileSync(
  new URL('./attempt-select.tsx', import.meta.url),
  'utf8',
);
const select = readFileSync(new URL('./select.tsx', import.meta.url), 'utf8');

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

  it('keeps the brand in the logo without repeating it in the report title', () => {
    expect(source).toContain('<Logo />');
    expect(source).toContain('<strong>Test Report</strong>');
    expect(source).toContain('aria-label="Test report content"');
    expect(source).not.toContain('Midscene Test Report');
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

  it('uses one shared Select for report filters and attempt switching', () => {
    expect(filters).toContain("import { Select } from './select'");
    expect(header).toContain(
      "import { AttemptSelect } from './attempt-select'",
    );
    expect(attemptSelect).toContain("import { Select } from './select'");
    expect(select).toContain("className={['runner-report-select'");
    expect(select).toContain("popupClassName={['runner-select-dropdown'");
  });

  it('keeps the Figma overrides split by page responsibility', () => {
    for (const partial of [
      'figma-shell.less',
      'figma-overview.less',
      'figma-detail.less',
      'figma-evidence.less',
      'figma-theme.less',
      'figma-responsive.less',
      'select.less',
    ]) {
      expect(figmaStyles).toContain(`@import './${partial}'`);
    }
  });

  it('removes the intermediate project page while keeping expansion and case navigation', () => {
    expect(breakdown).not.toContain('runner-project-tree-overview');
    expect(source).not.toContain('ProjectWorkspace');
    expect(breakdown).toContain('aria-expanded={expanded}');
    expect(source).toContain('backLabel="Overview"');
  });

  it('keeps the selected step description above the report tabs', () => {
    expect(inspector).toMatch(
      /className="runner-detail-evidence-title"[\s\S]*?<\/div>\s*\{step.title \? \(\s*<p className="runner-detail-step-description">/,
    );
    expect(inspector).toContain('className="runner-detail-tabs-row"');
    expect(figmaEvidenceStyles).toMatch(
      /\.runner-detail-evidence-heading \.runner-detail-step-description\s*\{/,
    );
  });

  it('keeps timeline preview hints concise without changing frame selection', () => {
    const timeline = readFileSync(
      new URL('./attempt-timeline.tsx', import.meta.url),
      'utf8',
    );
    expect(timeline).toContain('<small>Hover to preview</small>');
    expect(timeline).toContain(
      '<small>{formatTimelineTime(previewFrame.offsetMs)}</small>',
    );
    expect(timeline).not.toContain('click to lock');
    expect(timeline).toContain('onClick={() => onSelectFrame(item)}');
    expect(timeline).toContain('aria-pressed={isLocked}');
  });
});
