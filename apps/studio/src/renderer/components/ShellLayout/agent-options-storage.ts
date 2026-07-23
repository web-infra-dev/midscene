import {
  type StudioAgentOptions,
  normalizeStudioAgentOptions,
} from '../../../shared/agent-options';

const STORAGE_KEY = 'studio:agent-options';

export function loadAgentOptions(): StudioAgentOptions {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  const value = localStorage.getItem(STORAGE_KEY);
  if (!value) {
    return {};
  }

  try {
    return normalizeStudioAgentOptions(JSON.parse(value));
  } catch {
    return {};
  }
}

export function saveAgentOptions(options: StudioAgentOptions): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeStudioAgentOptions(options)),
  );
}
