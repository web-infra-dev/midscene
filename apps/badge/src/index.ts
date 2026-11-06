import { edgeCacheKey, handleRequest, withConditional } from './badge';

// Entry module: Workers only allow handler exports here, keep logic in badge.ts.
export default {
  async fetch(request, _env, ctx): Promise<Response> {
    const cacheKey = request.method === 'GET' ? edgeCacheKey(request) : null;
    if (!cacheKey) return withConditional(request, handleRequest(request));

    const cache = caches.default;
    let response = await cache.match(cacheKey);
    if (!response) {
      response = handleRequest(cacheKey);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return withConditional(request, response);
  },
} satisfies ExportedHandler;
