import { pathToFileURL } from 'node:url';
import type { WebContents } from 'electron';

export function isStudioRendererUrl(
  url: string,
  entryPath: string,
  devUrl?: string,
) {
  try {
    const candidate = new URL(url);
    const expected = new URL(devUrl || pathToFileURL(entryPath).href);
    // Hash routing is local to the same document. Other documents, even at
    // the same dev-server origin, must not inherit the native bridge.
    candidate.hash = '';
    expected.hash = '';
    return candidate.href === expected.href;
  } catch {
    return false;
  }
}

export function restrictStudioNavigation(
  contents: WebContents,
  isTrustedUrl: (url: string) => boolean,
) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => {
    if (!isTrustedUrl(event.url)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => {
    if (!isTrustedUrl(event.url)) event.preventDefault();
  });
}
