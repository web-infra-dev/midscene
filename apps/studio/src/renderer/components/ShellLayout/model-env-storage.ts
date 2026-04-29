import { useEnvConfig } from '@midscene/visualizer';
import { parseEnvText, resolveModelConnection } from './connectivity-env';

const STORAGE_KEY = 'studio:model-env-text';

// The Studio shell and the Playground panel read model env from two
// separate stores. The shell modal owns the raw text (for round-tripping
// in the UI) and uses it directly for the Connectivity Test IPC call.
// The Playground reads `useEnvConfig` from @midscene/visualizer to build
// its `overrideConfig` payload. If those stay out of sync, the server
// never learns about MIDSCENE_MODEL_NAME and agent creation throws.
// We mirror every shell save into `useEnvConfig` so both surfaces see
// the same values.
function mirrorToVisualizerStore(text: string): void {
  try {
    useEnvConfig.getState().loadConfig(text);
  } catch {
    // Visualizer store should always be available in the renderer, but
    // never take down the shell if a zustand internal change breaks this.
  }
}

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
  mirrorToVisualizerStore(text);
}

// Called once on renderer boot so any pre-existing shell text is also
// reflected into the visualizer store before the Playground reads it.
export function hydrateModelEnvStores(): void {
  const text = loadModelEnvText();
  if (!text) {
    return;
  }
  mirrorToVisualizerStore(text);
}

export function isModelEnvConfigured(text: string): boolean {
  if (!text.trim()) {
    return false;
  }
  const resolved = resolveModelConnection(parseEnvText(text));
  return !('error' in resolved);
}
