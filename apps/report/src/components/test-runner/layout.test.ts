import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';

const styles = readFileSync(
  new URL('./refinements.less', import.meta.url),
  'utf8',
);
const baseStyles = readFileSync(
  new URL('./index.less', import.meta.url),
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
const figmaDetailStyles = readFileSync(
  new URL('./figma-detail.less', import.meta.url),
  'utf8',
);
const figmaOverviewStyles = readFileSync(
  new URL('./figma-overview.less', import.meta.url),
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
const workspace = readFileSync(
  new URL('./case-workspace.tsx', import.meta.url),
  'utf8',
);
const executionPanel = readFileSync(
  new URL('./execution-panel.tsx', import.meta.url),
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
const selectStyles = readFileSync(
  new URL('./select.less', import.meta.url),
  'utf8',
);

describe('Midscene Test report layout', () => {
  it('keeps lifecycle hover rows square inside the rounded list', () => {
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

  it('uses the shared status tag spacing', () => {
    expect(styles).toMatch(
      /\.runner-status-badge\.runner-status-pill\s*\{[^}]*min-height: 24px;[^}]*padding: 4px 8px;[^}]*border-radius: 8px;/s,
    );
  });

  it('uses the report status palette and aligned attempt tag spacing', () => {
    for (const token of [
      '--runner-danger: #e53f39;',
      '--runner-danger-soft: #feece9;',
      '--runner-warning: #d97906;',
      '--runner-warning-soft: #fff0d6;',
      '--runner-success: #2d9b44;',
      '--runner-success-soft: #edf8ef;',
    ]) {
      expect(baseStyles).toContain(token);
    }
    expect(figmaDetailStyles).toMatch(
      /\.runner-single-attempt-label\s*\{[^}]*padding: 4px 12px;[^}]*gap: 8px;/s,
    );
    expect(attemptSelect).toContain(
      'attemptStatus ? <AttemptStatusBadge status={attemptStatus} /> : null',
    );
    expect(figmaDetailStyles).not.toContain(
      '.runner-attempt-select-shell > span.is-',
    );
    expect(selectStyles).toMatch(
      /\.runner-attempt-option-status\s*\{[^}]*height: 20px;[^}]*min-height: 20px;[^}]*padding: 0 8px;[^}]*border-radius: 6px;/s,
    );
    expect(selectStyles).toMatch(
      /\.runner-attempt-option-status\.is-success\s*\{[^}]*color: #2d9b44;[^}]*background: #edf8ef;/s,
    );
    expect(selectStyles).toMatch(
      /\.runner-attempt-option-status\.is-failed\s*\{[^}]*color: #e53f39;[^}]*background: #feece9;/s,
    );
  });

  it('keeps case rows clickable without a separate Inspect affordance', () => {
    expect(breakdown).not.toContain('runner-project-tree-case-cta');
    expect(breakdown).toContain('className="runner-project-tree-case-open"');
    expect(breakdown).toContain('onClick={() => onOpen(item, failure?.id)}');
  });

  it('draws one separator between expanded projects', () => {
    expect(baseStyles).toMatch(
      /\.runner-project-tree-node \+ \.runner-project-tree-node\s*\{[^}]*border-top: 1px solid var\(--runner-border\);/s,
    );
    expect(figmaOverviewStyles).toMatch(
      /\.runner-project-tree-case-item:last-child \.runner-project-tree-case\s*\{[^}]*border-bottom: 0;/s,
    );
  });

  it('shares the interactive attempt timeline between overview and detail', () => {
    expect(breakdown).toContain(
      "import { RunnerAttemptTimeline } from './attempt-timeline'",
    );
    expect(breakdown).toContain('variant="overview"');
    expect(breakdown).toContain('positionAttemptVisualFrames(');
    expect(breakdown).not.toContain('VisualTimeline');
    expect(workspace).toContain('variant="detail"');
  });

  it('uses one shared Select for report filters and attempt switching', () => {
    expect(filters).toContain("import { Select } from './select'");
    expect(figmaOverviewStyles).toMatch(
      /\.runner-breakdown-panel \.runner-breakdown-toolbar\s*\{[^}]*grid-template-columns: 184px 146px minmax\(240px, 317px\) 32px;/s,
    );
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

  it('shows a large timeline preview and keeps one frame paired with the selected step', () => {
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
    expect(timeline).toContain('aria-pressed={isSelected}');
    expect(timeline).toContain('runner-detail-timeline-preview-callout');
    expect(timeline).toContain('previewFrame.frame.screenshot.base64');
    expect(timeline).toContain('item.stepId === selectedStepId');
  });

  it('keeps the interactive timeline visible inside Execution', () => {
    expect(workspace).toContain('<RunnerAttemptTimeline');
    expect(workspace).toContain('<RunnerTimelinePlaybackControl');
    expect(executionPanel).toMatch(
      /className="runner-detail-panel-heading"[\s\S]*?\{timeline\}[\s\S]*?className="runner-detail-step-scroll"/,
    );
    expect(inspector).not.toContain('timeline?: ReactNode');
  });
});
