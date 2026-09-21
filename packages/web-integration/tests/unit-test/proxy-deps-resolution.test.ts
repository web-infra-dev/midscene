import { callAI, getModelRuntime } from '@midscene/core/ai-model';
import { describe, expect, it } from '@rstest/core';

// This suite resolves '@midscene/core' through node_modules into the built
// dist, so the lazy `import('#proxy-deps')` inside the service caller routes
// through the real package.json#imports mapping — the path that core's own
// unit tests bypass via their source alias. Configuring a proxy is the only
// way to reach that import; the unreachable local proxy makes the call fail
// with a connection error without any external traffic.
describe('proxy-deps resolution through built @midscene/core', () => {
  it('loads real proxy dependencies via the #proxy-deps mapping', async () => {
    const modelRuntime = getModelRuntime({
      modelName: 'proxy-test-model',
      modelDescription: 'proxy-test-model',
      intent: 'default',
      slot: 'default',
      openaiBaseURL: 'http://127.0.0.1:9/v1',
      openaiApiKey: 'proxy-test-key',
      httpProxy: 'http://127.0.0.1:9',
      retryCount: 0,
    } as Parameters<typeof getModelRuntime>[0]);

    let caught: unknown;
    try {
      await callAI([{ role: 'user', content: 'ping' }], modelRuntime);
    } catch (error) {
      caught = error;
    }

    // The call must get past `import('#proxy-deps')` and undici's ProxyAgent
    // construction, then fail on the unreachable proxy. A broken imports
    // mapping surfaces here as a module-resolution error instead.
    expect(caught).toBeDefined();
    const message = String(caught);
    expect(message).not.toMatch(/ERR_PACKAGE_IMPORT_NOT_DEFINED/);
    expect(message).not.toMatch(/Cannot find (module|package)/);
    expect(message).not.toMatch(/proxy dependencies are unavailable/);
  });
});
