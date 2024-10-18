import { PlaygroundServer } from '@/playground';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('Playground Server', () => {
  let server: PlaygroundServer;
  let serverBase: string;
  beforeAll(async () => {
    server = new PlaygroundServer();
    await server.launch();
    serverBase = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('post context', async () => {
    const contextData = JSON.stringify({
      foo: 'bar',
    });
    const res = await fetch(`${serverBase}/playground-with-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `context=${encodeURIComponent(contextData)}`,
      redirect: 'manual',
    });

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toBeDefined();
    expect(location).toContain('/context/');

    // retrieve context
    const contextRes = await fetch(`${serverBase}${location}`);
    const context = await contextRes.json();
    expect(context).toBeDefined();
    expect(context.context).toBe(contextData);
  });
});
