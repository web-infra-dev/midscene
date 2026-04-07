import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_YAML_LANGUAGE_PREFERENCE,
  YAML_LANGUAGE_STORAGE_KEY,
  getStoredYamlLanguagePreference,
  persistYamlLanguagePreference,
  resolveYamlGenerationLanguage,
} from '../src/extension/recorder/shared/yamlLanguage';

describe('yaml language settings', () => {
  it('falls back to auto when storage is empty', () => {
    const storage = {
      getItem: vi.fn(() => null),
    };

    expect(getStoredYamlLanguagePreference(storage)).toBe(
      DEFAULT_YAML_LANGUAGE_PREFERENCE,
    );
  });

  it('returns a custom language stored by the user', () => {
    const storage = {
      getItem: vi.fn(() => 'Japanese'),
    };

    expect(getStoredYamlLanguagePreference(storage)).toBe('Japanese');
  });

  it('returns an explicitly stored YAML language', () => {
    const storage = {
      getItem: vi.fn(() => 'Chinese'),
    };

    expect(getStoredYamlLanguagePreference(storage)).toBe('Chinese');
  });

  it('persists YAML language preference with the expected key', () => {
    const storage = {
      setItem: vi.fn(),
    };

    persistYamlLanguagePreference('English', storage);

    expect(storage.setItem).toHaveBeenCalledWith(
      YAML_LANGUAGE_STORAGE_KEY,
      'English',
    );
  });

  it('resolves auto to the preferred language', () => {
    expect(resolveYamlGenerationLanguage('auto', 'Chinese')).toBe('Chinese');
  });

  it('keeps explicit language selections unchanged', () => {
    expect(resolveYamlGenerationLanguage('English', 'Chinese')).toBe('English');
  });
});
