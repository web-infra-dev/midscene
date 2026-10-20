import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/playground-app', () => ({
  PlaygroundConversationPanel: () => null,
}));

vi.mock('../src/renderer/components/Recorder', () => ({
  StudioReplayPanel: () => null,
  StudioRecorderPanel: () => null,
}));

vi.mock('../src/renderer/components/StudioTimelinePanel', () => ({
  StudioTimelineHeader: () => null,
}));

const { createStudioTimelineConfig } = await import(
  '../src/renderer/components/Playground'
);

describe('StudioExecutionEmptyState', () => {
  it('renders the compact timeline empty state without playground welcome copy', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, createStudioTimelineConfig().emptyState),
    );

    expect(html).toContain('studio-execution-empty-state');
    expect(html).toContain('No execution yet');
    expect(html).toContain('The mission progress will be displayed here.');
    expect(html).not.toContain('Welcome to');
    expect(html).not.toContain('Midscene.js Playground!');
  });
});
