import { describe, expect, it } from 'vitest';
import { createStudioPlaygroundConfig } from '../src/renderer/components/Playground';

describe('Studio playground config', () => {
  it('uses the full prompt chrome like the Chrome extension playground', () => {
    expect(createStudioPlaygroundConfig()).toMatchObject({
      promptInputChrome: {
        variant: 'default',
      },
    });
  });
});
