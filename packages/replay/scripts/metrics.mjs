/** Count actual transport attempts without persisting requests or credentials. */
export function trackModelRequests() {
  const original = globalThis.fetch;
  const metrics = {
    phase: 'setup',
    requests: [],
    stop: () => {
      globalThis.fetch = original;
    },
  };
  globalThis.fetch = async (input, init) => {
    let body;
    try {
      body = JSON.parse(
        typeof init?.body === 'string'
          ? init.body
          : input instanceof Request
            ? await input.clone().text()
            : '{}',
      );
    } catch {
      /* Not a model JSON request. */
    }
    if (!body?.model) return original(input, init);
    const request = {
      phase: metrics.phase,
      model: body.model,
      status: 'pending',
      ms: 0,
    };
    metrics.requests.push(request);
    const start = performance.now();
    try {
      const response = await original(input, init);
      request.status = response.status;
      return response;
    } catch (error) {
      request.status = 'transport-error';
      throw error;
    } finally {
      request.ms = Math.round(performance.now() - start);
    }
  };
  return metrics;
}
