import { parseEnvText, resolveModelConnection } from './connectivity-env';

const STORAGE_KEY = 'studio:model-env-text';

export function loadModelEnvText(): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function saveModelEnvText(text: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, text);
}

export function isModelEnvConfigured(text: string): boolean {
  if (!text.trim()) {
    return false;
  }
  const resolved = resolveModelConnection(parseEnvText(text));
  return !('error' in resolved);
}
