function unavailable(): never {
  throw new Error('proxy dependencies are unavailable in browser builds');
}

export function loadUndici(): Promise<typeof import('undici')> {
  return unavailable();
}

export function loadFetchSocks(): Promise<typeof import('fetch-socks')> {
  return unavailable();
}
