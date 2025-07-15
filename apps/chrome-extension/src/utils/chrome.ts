/// <reference types="chrome" />

export function getExtensionVersion() {
  return chrome.runtime?.getManifest?.()?.version || 'unknown';
}
