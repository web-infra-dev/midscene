/** Normalize a WebDriver server URL before appending API endpoint paths. */
export function normalizeWebDriverBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Invalid WebDriver base URL: expected a full HTTP(S) URL');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    baseUrl.includes('?') ||
    baseUrl.includes('#') ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'WebDriver base URL must be an HTTP(S) URL without credentials, query, or fragment',
    );
  }

  return url.toString().replace(/\/+$/, '');
}
