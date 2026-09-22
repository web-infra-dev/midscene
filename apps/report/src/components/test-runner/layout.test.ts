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
const figmaShellStyles = readFileSync(
  new URL('./figma-shell.less', import.meta.url),
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
const appSource = readFileSync(
  new URL('../../App.tsx', import.meta.url),
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
    expect(source).toContain('className="runner-header-inner"');
    expect(source).toContain('Midscene {midsceneVersion}');
    expect(source).toContain('report.get().sdkVersion.trim()');
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
      /\.runner-single-attempt-label\s*\{[^}]*padding: 4px 12px 4px 4px;[^}]*gap: 8px;/s,
    );
    expect(attemptSelect).toContain('optionLabelProp="label"');
    expect(attemptSelect).toContain('popupMatchSelectWidth');
    expect(figmaDetailStyles).not.toContain(
      '.runner-attempt-select-shell > span.is-',
    );
    expect(selectStyles).toMatch(
      /\.runner-status-badge\.runner-status-pill\.runner-attempt-option-status\s*\{[^}]*box-sizing: border-box;[^}]*width: 60px;[^}]*height: 24px;[^}]*min-height: 24px;[^}]*padding: 0 8px;/s,
    );
    expect(selectStyles).toMatch(
      /\.runner-attempt-option-status\.is-success\s*\{[^}]*color: var\(--runner-success, #2d9b44\);[^}]*background: var\(--runner-success-soft, #edf8ef\);/s,
    );
    expect(selectStyles).toMatch(
      /\.runner-attempt-option-status\.is-failed\s*\{[^}]*color: var\(--runner-danger, #e53f39\);[^}]*background: var\(--runner-danger-soft, #feece9\);/s,
    );
    expect(select).toContain("closest('.test-runner-report')");
  });

  it('keeps case rows clickable without a separate Inspect affordance', () => {
    expect(breakdown).not.toContain('runner-project-tree-case-cta');
    expect(breakdown).toContain('className="runner-project-tree-case-open"');
    expect(breakdown).toContain('onClick={() => onOpen(item, failure?.id)}');
  });

  it('draws one separator between Projects and their expanded rows', () => {
    expect(baseStyles).toMatch(
      /\.runner-project-tree-node \+ \.runner-project-tree-node\s*\{[^}]*border-top: 1px solid var\(--runner-border\);/s,
    );
    expect(figmaOverviewStyles).toMatch(
      /\.runner-project-tree-case-item:last-child \.runner-project-tree-case\s*\{[^}]*border-bottom: 0;/s,
    );
    expect(figmaOverviewStyles).toMatch(
      /\.runner-project-tree-node\.is-expanded \.runner-project-tree-children\s*\{[^}]*border-top: 1px solid var\(--runner-border\);/s,
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
      /\.runner-breakdown-panel \.runner-breakdown-toolbar\s*\{[^}]*grid-template-columns: 184px minmax\(240px, 317px\) 32px;/s,
    );
    expect(header).toContain(
      "import { AttemptSelect } from './attempt-select'",
    );
    expect(attemptSelect).toContain("import { Select } from './select'");
    expect(select).toContain("className={['runner-report-select'");
    expect(select).toContain("popupClassName={['runner-select-dropdown'");
  });

  it('sorts the Project table from its column headers', () => {
    expect(filters).not.toContain('Sort Project breakdown');
    for (const value of [
      'name',
      'case-count',
      'passed-count',
      'result',
      'duration',
    ]) {
      expect(breakdown).toContain(`value="${value}"`);
    }
    expect(breakdown).toContain('aria-pressed={active}');
    expect(figmaOverviewStyles).toContain('.runner-project-sort-button');
    expect(figmaOverviewStyles).toContain(
      'color: var(--runner-sort-arrow-idle);',
    );
    expect(figmaOverviewStyles).toContain(
      'color: var(--runner-sort-arrow-active);',
    );
    expect(figmaShellStyles).toContain(
      '--runner-sort-arrow-idle: rgb(51 51 51 / 30%);',
    );
    expect(figmaShellStyles).toContain(
      '--runner-sort-arrow-active: rgb(51 51 51 / 50%);',
    );
  });

  it('keeps all six summary metrics separated on wide layouts', () => {
    expect(figmaOverviewStyles).toMatch(
      /\.runner-metric-card:nth-child\(3n\):not\(:last-child\)\s*\{[^}]*border-right: 1px solid var\(--runner-border\);/s,
    );
  });

  it('anchors the header decoration to the full report viewport', () => {
    expect(figmaShellStyles).toContain('.runner-main::before');
    expect(figmaShellStyles).not.toContain('.runner-page::before');
  });

  it('centers the Header and report pages on the same wide-screen grid', () => {
    expect(figmaShellStyles).toMatch(
      /\.runner-header-inner\s*\{[^}]*width: min\(1424px, 100%\);[^}]*margin-inline: auto;[^}]*padding: 0 40px;/s,
    );
    expect(figmaShellStyles).toMatch(
      /\.runner-page,[\s\S]*?\.runner-case-workspace\s*\{[^}]*width: min\(1424px, 100%\);[^}]*margin-inline: auto;[^}]*padding: 40px;/s,
    );
  });

  it('uses separate expand and collapse icons for the Project list toggle', () => {
    expect(filters).toContain("allProjectsExpanded ? ' is-collapse' : ''");
    expect(figmaOverviewStyles).toMatch(
      /\.runner-project-expansion-icon\s*\{[^}]*project-expansion\.svg/s,
    );
    expect(figmaOverviewStyles).toMatch(
      /&\.is-collapse\s*\{[^}]*project-collapse\.svg/s,
    );
  });

  it('renders platform metadata only when the report provides it', () => {
    expect(header).toContain('item.project.platform ?');
    expect(breakdown).toContain('item.project.platform ?');
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
    expect(inspector).toContain(
      'const stepDescription = getStepDisplayName(step)',
    );
    expect(inspector).toMatch(
      /\{stepDescription !== step.node \? \(\s*<p className="runner-detail-step-description">/,
    );
    expect(inspector).toContain('className="runner-detail-tabs-row"');
    expect(figmaEvidenceStyles).toMatch(
      /\.runner-detail-evidence-heading \.runner-detail-step-description\s*\{/,
    );
  });

  it('keeps the embedded trace resizable without a separate page action', () => {
    expect(inspector).not.toContain('Open AI trace in new tab');
    expect(inspector).not.toContain('target="_blank"');
    expect(appSource).toContain('aria-label="Resize report sidebar"');
    expect(appSource).toContain('clampSidebarWidth(');
    expect(figmaEvidenceStyles).toMatch(
      /\.runner-detail-inline-trace \.main-layout > \.resize-handle\s*\{[^}]*display: block;[^}]*width: 8px;/s,
    );
    expect(figmaEvidenceStyles).not.toMatch(
      /\.runner-detail-inline-trace \.main-layout > \.resize-handle\s*\{[^}]*display: none;/s,
    );
  });

  it('reserves trace height while switching tabs to prevent page jumps', () => {
    expect(inspector).toContain('stabilizeContentHeight={hasAgentTrace}');
    expect(figmaEvidenceStyles).toMatch(
      /\.runner-detail-inspector-content\.has-stable-trace-height\s*\{[^}]*min-height: 864px;/s,
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
    expect(timeline).toContain('resolveTimelinePreviewPlacement');
    expect(baseStyles).toMatch(
      /\.runner-detail-timeline-preview-callout\.is-above\s*\{[^}]*bottom: calc\(100% \+ 8px\);/s,
    );
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
