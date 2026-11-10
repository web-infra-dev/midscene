export function isOpenRouter(baseURL?: string): boolean {
  return baseURL ? new URL(baseURL).hostname === 'openrouter.ai' : false;
}
