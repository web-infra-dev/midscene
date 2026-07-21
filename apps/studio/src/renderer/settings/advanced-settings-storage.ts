import {
  EMPTY_STUDIO_RUNTIME_SETTINGS,
  type StudioRuntimeSettingsV1,
  normalizeStudioRuntimeSettings,
} from '@shared/advanced-settings';

export const ADVANCED_SETTINGS_STORAGE_KEY =
  'midscene-studio.advanced-settings';

let warnedAboutInvalidSettings = false;
let warnedAboutStorageFailure = false;

function emptySettings(): StudioRuntimeSettingsV1 {
  return normalizeStudioRuntimeSettings(EMPTY_STUDIO_RUNTIME_SETTINGS);
}

function warnAboutInvalidSettings(error: unknown): void {
  if (warnedAboutInvalidSettings) return;
  warnedAboutInvalidSettings = true;
  console.warn('[studio] Ignoring invalid advanced settings:', error);
}

function warnAboutStorageFailure(error: unknown): void {
  if (warnedAboutStorageFailure) return;
  warnedAboutStorageFailure = true;
  console.warn(
    '[studio] Advanced settings are available for this session but could not be persisted:',
    error,
  );
}

export function loadAdvancedSettings(): StudioRuntimeSettingsV1 {
  if (typeof window === 'undefined') {
    return emptySettings();
  }

  try {
    const stored = window.localStorage.getItem(ADVANCED_SETTINGS_STORAGE_KEY);
    if (!stored) return emptySettings();
    return normalizeStudioRuntimeSettings(JSON.parse(stored));
  } catch (error) {
    warnAboutInvalidSettings(error);
    return emptySettings();
  }
}

export function saveAdvancedSettings(
  settings: StudioRuntimeSettingsV1,
): StudioRuntimeSettingsV1 {
  const normalized = normalizeStudioRuntimeSettings(settings);
  try {
    window.localStorage.setItem(
      ADVANCED_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch (error) {
    warnAboutStorageFailure(error);
  }
  return normalized;
}
