export const STUDIO_EXTERNAL_LINKS = {
  github: 'https://github.com/web-infra-dev/midscene',
  website: 'https://midscenejs.com',
  androidIntegrationFaq:
    'https://midscenejs.com/integrate-with-android.html#faq',
  harmonyGettingStarted:
    'https://midscenejs.com/harmony-getting-started.html#install-hdc',
  // Used by external-only update targets (currently Linux only — Windows now
  // ships an NSIS installer that supports in-place update via NsisUpdater)
  // to send the user to the GitHub Releases page for a manual download.
  studioReleases: 'https://github.com/web-infra-dev/midscene/releases',
} as const;

export function resolveExternalUrl(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid external URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${parsedUrl.protocol}`);
  }

  return parsedUrl.toString();
}
