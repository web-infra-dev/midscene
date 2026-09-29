declare module '#proxy-deps' {
  export function loadUndici(): Promise<typeof import('undici')>;
  export function loadFetchSocks(): Promise<typeof import('fetch-socks')>;
}
