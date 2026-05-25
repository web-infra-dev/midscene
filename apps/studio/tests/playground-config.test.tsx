import { describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/playground-app', () => ({
  PlaygroundConversationPanel: () => null,
}));
vi.mock('../src/renderer/components/Recorder/StudioRecorderPanel', () => ({
  StudioRecorderPanel: () => null,
}));

const { createStudioPlaygroundConfig } = await import(
  '../src/renderer/components/Playground'
);

describe('Studio playground config', () => {
  it('uses the full prompt chrome like the Chrome extension playground', () => {
    expect(createStudioPlaygroundConfig()).toMatchObject({
      promptInputChrome: {
        variant: 'default',
      },
    });
  });
});
