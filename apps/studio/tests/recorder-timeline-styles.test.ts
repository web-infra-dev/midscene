import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  new URL(
    '../src/renderer/components/Recorder/studio-recorder-panel.css',
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
});
