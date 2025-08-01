import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  MIDSCENE_USE_DOUBAO_VISION,
  overrideAIConfig,
  vlLocateMode,
} from '../../src/env';

describe('env', () => {
  afterAll(() => {
    // Reset process.env before each test
    vi.resetModules();
  });

  it('getAIConfigInBoolean', () => {
    overrideAIConfig({
      [MIDSCENE_USE_DOUBAO_VISION]: 'true',
    });

    const vlMode = vlLocateMode();
    expect(vlMode).toBe('doubao-vision');
  });

  it('getAIConfigInBoolean 2', () => {
    overrideAIConfig({
      [MIDSCENE_USE_DOUBAO_VISION]: 1 as any,
    });

    const vlMode = vlLocateMode();
    expect(vlMode).toBe('doubao-vision');
  });
});
