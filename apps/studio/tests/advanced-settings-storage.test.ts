// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADVANCED_SETTINGS_STORAGE_KEY,
  loadAdvancedSettings,
  saveAdvancedSettings,
} from '../src/renderer/settings/advanced-settings-storage';

describe('advanced settings storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips normalized settings', () => {
    saveAdvancedSettings({
      schemaVersion: 1,
      agentOptions: {
        aiActContext: 'Prefer visible controls',
        screenshotShrinkFactor: 24,
      },
    });

    expect(loadAdvancedSettings()).toEqual({
      schemaVersion: 1,
      agentOptions: {
        aiActContext: 'Prefer visible controls',
        screenshotShrinkFactor: 24,
      },
    });
  });

  it('falls back safely when stored data is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.setItem(
      ADVANCED_SETTINGS_STORAGE_KEY,
      JSON.stringify({ agentOptions: { waitAfterAction: -1 } }),
    );

    expect(loadAdvancedSettings()).toEqual({
      schemaVersion: 1,
      agentOptions: {},
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('falls back safely when localStorage cannot be read', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });

    expect(loadAdvancedSettings()).toEqual({
      schemaVersion: 1,
      agentOptions: {},
    });
  });

  it('keeps settings available to the current session when persistence fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    });

    expect(
      saveAdvancedSettings({
        schemaVersion: 1,
        agentOptions: { waitAfterAction: 250 },
      }),
    ).toEqual({
      schemaVersion: 1,
      agentOptions: { waitAfterAction: 250 },
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
