import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./index.less', import.meta.url), 'utf8');

describe('sidebar layout', () => {
  it('keeps report overview spacing independent of the active view', () => {
    const reportOverviewRule =
      styles.match(/\.report-overview\s*{[^}]+}/)?.[0] ?? '';

    expect(reportOverviewRule).toContain('padding-top: 12px;');
    expect(styles).not.toMatch(/&\.human-view\s+\.report-overview/);
  });
});
