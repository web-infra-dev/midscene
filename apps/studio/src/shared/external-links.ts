export const STUDIO_EXTERNAL_LINKS = {
  github: 'https://github.com/web-infra-dev/midscene',
  website: 'https://midscenejs.com',
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
