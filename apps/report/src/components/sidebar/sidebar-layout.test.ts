import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';

const styles = readFileSync(new URL('./index.less', import.meta.url), 'utf8');
const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const commonStyles = readFileSync(
  new URL('../common.less', import.meta.url),
  'utf8',
);
const appStyles = readFileSync(
  new URL('../../App.less', import.meta.url),
  'utf8',
);
const screenshotStyles = readFileSync(
  new URL('../agent-screenshot-view/index.less', import.meta.url),
  'utf8',
);

describe('sidebar layout', () => {
  it('keeps report overview spacing independent of the active view', () => {
    const reportOverviewRule =
      styles.match(/\.report-overview\s*{[^}]+}/)?.[0] ?? '';

    expect(reportOverviewRule).toContain('padding-top: 12px;');
    expect(styles).not.toMatch(/&\.human-view\s+\.report-overview/);
  });

  it('aligns the sidebar and content pane header dividers', () => {
    expect(commonStyles).toContain('@report-pane-header-height: 48px;');
    expect(styles).toMatch(
      /\.page-nav\s*{[^}]*height: @report-pane-header-height;/s,
    );
    expect(appStyles).toMatch(
      /\.main-right-header\s*{[^}]*height: @report-pane-header-height;/s,
    );
    expect(screenshotStyles).toMatch(
      /\.agent-screenshot-header\s*{[^}]*height: @report-pane-header-height;/s,
    );
  });

  it('keeps timing tooltip definitions readable within the viewport', () => {
    expect(source.match(/rootClassName="total-time-tooltip"/g)).toHaveLength(1);
    expect(source.match(/placement="topLeft"/g)).toHaveLength(1);
    expect(styles).toMatch(
      /\.ant-tooltip\.total-time-tooltip\s*{[^}]*max-width: min\(360px, calc\(100vw - 24px\)\);/s,
    );
    expect(styles).toMatch(
      /\.total-time-tooltip-metric,\s*\.total-time-tooltip-description\s*{[^}]*grid-column: 1 \/ -1;/s,
    );
  });

  it('exposes replay-all as a labeled keyboard-accessible button', () => {
    expect(source).toMatch(
      /<button\s+type="button"\s+className="icon-button"\s+aria-label="Replay all tasks"/,
    );
    expect(source).not.toMatch(/<div\s+className="icon-button"/);
    expect(styles).toMatch(
      /\.icon-button\s*{[^}]*border: 0;[^}]*background: transparent;/s,
    );
    expect(styles).toMatch(/\.icon-button\s*{[\s\S]*?&:focus-visible\s*{/);
  });
});
