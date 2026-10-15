import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';

const statusStyles = readFileSync(
  new URL('./status-badge.less', import.meta.url),
  'utf8',
);
const baseStyles = readFileSync(
  new URL('./index.less', import.meta.url),
  'utf8',
);
const tokenStyles = readFileSync(
  new URL('./tokens.less', import.meta.url),
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
  it('uses themed brand artwork without repeating its report title', () => {
    expect(source).toContain('alt="Midscene.js Test Report"');
    expect(source).toContain(
      'src={isDarkMode ? reportLogoDark : reportLogoLight}',
    );
    expect(source).not.toContain('<strong>Test Report</strong>');
    expect(source).toContain('className="runner-header-inner"');
    expect(source).toContain('Midscene {midsceneVersion}');
    expect(source).toContain('report.get().sdkVersion.trim()');
    expect(source).toContain('aria-label="Test report content"');
    expect(source).not.toContain('Midscene Test Report');
    expect(source).not.toContain('Test Runner');
  });

  it('uses the shared status tag spacing', () => {
    expect(statusStyles).toMatch(
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
      expect(tokenStyles).toContain(token);
    }
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
    expect(selectStyles).toMatch(
      /\.runner-select-chevron\s*\{[^}]*width: 15px;[^}]*height: 15px;[^}]*mask: url\('\.\/assets\/overview-chevron-down.svg'\)/s,
    );
  });

  it('opens a Case at its failed Step from the row', () => {
    expect(breakdown).toContain('className="runner-case-open"');
    expect(breakdown).toContain('onClick={() => onOpen(item, failure?.id)}');
  });

  it('keeps File and Case metrics aligned in semantic tables', () => {
    expect(breakdown).toContain('<colgroup>');
    expect(breakdown).toContain('scope="col"');
    expect(breakdown).toContain('scope="row"');
    expect(figmaOverviewStyles).toContain('table-layout: fixed;');
    expect(figmaOverviewStyles).toContain('min-width: 760px;');
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

  it('uses checkboxes for filters and preserves shared attempt Selects', () => {
    expect(filters).toContain('<Checkbox');
    expect(filters).not.toContain('<Select');
    expect(header).toContain(
      "import { AttemptSelect } from './attempt-select'",
    );
    expect(attemptSelect).toContain("import { Select } from './select'");
  });

  it('sorts File and Case siblings through table column headers', () => {
    for (const label of ['Files', 'Passed / Case', 'Attention', 'Duration'])
      expect(breakdown).toContain(label);
    expect(breakdown).toContain('aria-sort=');
    expect(breakdown).not.toContain('label="Project"');
  });

  it('anchors the header decoration to the full report viewport', () => {
    expect(figmaShellStyles).toContain('.runner-main::before');
    expect(figmaShellStyles).not.toContain('.runner-page::before');
  });

  it('fills wide screens with aligned 40px header and content insets', () => {
    expect(figmaShellStyles).toMatch(
      /\.runner-header-inner\s*\{[^}]*width: 100%;[^}]*margin-inline: auto;[^}]*padding: 0 40px;/s,
    );
    expect(figmaShellStyles).toMatch(
      /\.runner-page,[\s\S]*?\.runner-case-workspace\s*\{[^}]*width: 100%;[^}]*margin-inline: auto;[^}]*padding: 40px 32px;/s,
    );
  });

  it('renders platform metadata only when the report provides it', () => {
    expect(header).toContain('item.project.platform ?');
  });

  it('loads the shared palette and page layout partials from one entry point', () => {
    for (const partial of [
      'tokens.less',
      'status-badge.less',
      'figma-shell.less',
      'figma-overview.less',
      'figma-detail.less',
      'figma-evidence.less',
      'figma-theme.less',
      'figma-responsive.less',
      'select.less',
    ]) {
      expect(baseStyles).toContain(`@import './${partial}'`);
    }
  });

  it('keeps file expansion and the Case back link to Overview', () => {
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

  it('draws keyboard focus inside step rows so scrolling cannot clip the ring', () => {
    expect(figmaDetailStyles).toMatch(
      /\.runner-detail-step-list > button:focus-visible\s*\{[^}]*outline: 2px solid var\(--runner-primary\);[^}]*outline-offset: -2px;/s,
    );
  });

  it('keeps the interactive timeline visible inside Execution', () => {
    expect(workspace).toContain('<RunnerAttemptTimeline');
    expect(workspace).not.toContain('RunnerTimelinePlaybackControl');
    expect(executionPanel).toMatch(
      /className="runner-detail-panel-heading"[\s\S]*?className="runner-execution-visual" hidden=\{showYaml\}[\s\S]*?\{timeline\}[\s\S]*?className="runner-detail-step-scroll"/,
    );
    expect(inspector).not.toContain('timeline?: ReactNode');
  });
});
