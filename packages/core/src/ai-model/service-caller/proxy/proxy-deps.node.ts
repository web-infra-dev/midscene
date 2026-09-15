export function loadUndici(): Promise<typeof import('undici')> {
  return import('undici');
}

export function loadFetchSocks(): Promise<typeof import('fetch-socks')> {
  return import('fetch-socks');
}
