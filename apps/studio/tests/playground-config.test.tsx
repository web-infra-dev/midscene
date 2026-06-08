import { describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/playground-app', () => ({
  PlaygroundConversationPanel: () => null,
}));
vi.mock('../src/renderer/components/Recorder/StudioRecorderPanel', () => ({
  StudioRecorderPanel: () => null,
}));

(
  globalThis as { __STUDIO_RECORDER_ENTRY_ENABLED__?: boolean }
).__STUDIO_RECORDER_ENTRY_ENABLED__ = true;

const { createStudioPlaygroundConfig, createStudioPlaygroundStorageNamespace } =
  await import('../src/renderer/components/Playground');

describe('Studio playground config', () => {
  it('uses the full prompt chrome like the Chrome extension playground', () => {
    expect(createStudioPlaygroundConfig()).toMatchObject({
      showClearButton: true,
      promptInputChrome: {
        variant: 'default',
      },
    });
  });

  it('uses a target-scoped storage namespace for Studio conversations', () => {
    const namespace = createStudioPlaygroundStorageNamespace(
      '{"platformId":"android","deviceId":"emulator-5554"}',
    );

    expect(namespace).toBe(
      'studio-playground-%7B%22platformId%22%3A%22android%22%2C%22deviceId%22%3A%22emulator-5554%22%7D',
    );
    expect(
      createStudioPlaygroundConfig({ storageNamespace: namespace }),
    ).toMatchObject({
      storageNamespace: namespace,
    });
  });
});
