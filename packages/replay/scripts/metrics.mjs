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

/** Count Playwright screenshot attempts, including Agent reports and popups. CDP fallback is not counted. */
export function trackScreenshots(page, phase) {
  const context = page.context();
  const originals = new Map();
  const events = [];
  const attach = (target) => {
    if (originals.has(target)) return;
    const original = target.screenshot;
    originals.set(target, original);
    target.screenshot = async function (...args) {
      const event = { phase: phase(), ms: 0 };
      const start = performance.now();
      events.push(event);
      try {
        return await original.apply(this, args);
      } finally {
        event.ms = Math.round(performance.now() - start);
      }
    };
  };
  for (const target of context.pages()) attach(target);
  context.on('page', attach);
  return {
    events,
    stop() {
      context.off('page', attach);
      for (const [target, original] of originals) target.screenshot = original;
    },
  };
}
