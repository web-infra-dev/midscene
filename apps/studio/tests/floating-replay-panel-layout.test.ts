import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const recorderStyles = readFileSync(
  new URL(
    '../src/renderer/components/Recorder/studio-recorder-panel.css',
    import.meta.url,
  ),
  'utf8',
);
const mainContent = readFileSync(
  new URL('../src/renderer/components/MainContent/index.tsx', import.meta.url),
  'utf8',
);

describe('floating Replay panel layout', () => {
  it('collapses the overlay to the session picker until a timeline exists', () => {
    expect(mainContent).toContain(
      "'pointer-events-none studio-mode-panel-overlay-floating'",
    );
    expect(recorderStyles).toContain(
      '.studio-mode-panel-pane-active.studio-replay-column',
    );
    expect(recorderStyles).toMatch(
      /\.studio-mode-panel-overlay-floating:has\([\s\S]*?\.studio-mode-panel-pane-active\.studio-replay-column\s*>\s*\.studio-replay-panel:only-child[\s\S]*?\)\s*\{\s*bottom:\s*auto;/,
    );
    expect(recorderStyles).toMatch(
      /\.studio-mode-panel-pane-active\s*\{\s*position:\s*relative;[\s\S]*?height:\s*auto;/,
    );
  });
});
