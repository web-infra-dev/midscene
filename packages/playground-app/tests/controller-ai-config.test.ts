import { describe, expect, it, vi } from 'vitest';
import {
  applyPlaygroundAiConfig,
  hasPlaygroundAiConfig,
} from '../src/controller/ai-config';

describe('playground ai config helpers', () => {
  it('detects when ai config is present', () => {
    expect(hasPlaygroundAiConfig({})).toBe(false);
    expect(hasPlaygroundAiConfig({ MIDSCENE_MODEL_NAME: 'gpt-4o-mini' })).toBe(
      true,
    );
  });

  it('skips override when ai config is empty', async () => {
    const overrideConfig = vi.fn();

    const applied = await applyPlaygroundAiConfig({ overrideConfig }, {});

    expect(applied).toBe(false);
    expect(overrideConfig).not.toHaveBeenCalled();
  });

  it('pushes ai config to the playground sdk', async () => {
    const overrideConfig = vi.fn().mockResolvedValue(undefined);
    const config = {
      MIDSCENE_MODEL_BASE_URL: 'https://example.com/v1',
      MIDSCENE_MODEL_NAME: 'gpt-4o-mini',
    };

    const applied = await applyPlaygroundAiConfig({ overrideConfig }, config);

    expect(applied).toBe(true);
    expect(overrideConfig).toHaveBeenCalledWith(config);
  });
});
