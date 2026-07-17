import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  new URL(
    '../src/renderer/components/Recorder/studio-recorder-panel.css',
    import.meta.url,
  ),
  'utf8',
);
const timelinePanelStyles = readFileSync(
  new URL(
    '../src/renderer/components/StudioTimelinePanel/studio-timeline-panel.css',
    import.meta.url,
  ),
  'utf8',
);

describe('recorder timeline styles', () => {
  it('aligns event icons with the first line of copy', () => {
    expect(styles).toMatch(
      /\.studio-recorder-timeline-rail-line-top\s*\{\s*flex: 0 0 8px;/,
    );
    expect(styles).toMatch(
      /\.studio-recorder-timeline-icon\s*\{[\s\S]*?margin: 3px 0;/,
    );
  });

  it('uses a neutral rail between blue event icons', () => {
    expect(styles).toMatch(
      /\.studio-recorder-timeline-rail-line\s*\{[\s\S]*?background: #e5e5e5;/,
    );
  });

  it('does not render a trailing rail after the last event', () => {
    expect(styles).toMatch(
      /\.studio-recorder-timeline-item:last-child\s+\.studio-recorder-timeline-rail-line-bottom\s*\{\s*display: none;/,
    );
  });

  it('keeps the recorder timeline scrollable inside the floating Markdown layout', () => {
    expect(styles).toMatch(
      /\.studio-recorder-task-card:not\(\.studio-timeline-panel-empty\):not\(\s*\.studio-timeline-panel-collapsed\s*\)\s*\.studio-timeline-panel-scroll-body\s*\{\s*max-height: none;\s*flex: 1 1 auto;/,
    );
    expect(styles).toMatch(
      /\.studio-recorder-task-card:not\(\.studio-timeline-panel-empty\):not\(\s*\.studio-timeline-panel-collapsed\s*\)\s*\.studio-recorder-floating-main\s*\{\s*min-height: 0;\s*max-height: none;\s*flex: 1 1 auto;\s*overscroll-behavior: contain;/,
    );
    expect(styles).toMatch(
      /\.studio-mode-panel-pane-active\.studio-recorder-column\s*\{\s*display: flex;\s*min-height: 0;/,
    );
    expect(styles).toMatch(
      /\.studio-mode-panel-pane-active\.studio-recorder-column\s*>\s*\.studio-recorder-panel\s*\{\s*height: 100%;\s*flex: 1 1 auto;/,
    );
    expect(styles).toMatch(
      /\.studio-mode-panel-overlay-floating\s+\.studio-recorder-panel\s*\{\s*height: 100%;/,
    );
    expect(styles).toMatch(
      /\.studio-recorder-panel\s*>\s*\.studio-recorder-task-card:not\(\.studio-timeline-panel-empty\):not\(\s*\.studio-timeline-panel-collapsed\s*\)\s*\{\s*height: auto;\s*max-height: calc\(100% - 212\.077px\);\s*flex: 0 1 auto;/,
    );
    expect(styles).toMatch(
      /\.studio-mode-panel-overlay-floating\s+\.studio-recorder-floating-main\s*\{\s*pointer-events: auto;/,
    );
  });

  it('hides the shared Timeline scrollbar for Record without disabling scroll', () => {
    expect(styles).not.toContain('::-webkit-scrollbar');
    expect(timelinePanelStyles).toMatch(
      /\.studio-timeline-panel-scroll-body\s*\{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/,
    );
    expect(timelinePanelStyles).toMatch(
      /\.studio-timeline-panel-scroll-body::-webkit-scrollbar\s*\{\s*width: 0;\s*height: 0;/,
    );
  });

  it('keeps the recorder primary copy legible in dark mode', () => {
    expect(styles).toMatch(
      /\[data-theme="dark"\]\s+\.studio-recorder-floating-primer-status,\s*\[data-theme="dark"\]\s+\.studio-recorder-floating-primer-status-copy\s*\{\s*color: #fff;/,
    );
  });
});
