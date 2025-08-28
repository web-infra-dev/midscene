import {
  PlaygroundServer,
  StaticPage,
  StaticPageAgent,
} from '@midscene/playground';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Playground Server', () => {
  let server: PlaygroundServer;
  let serverBase: string;
  beforeAll(async () => {
    server = new PlaygroundServer(StaticPage, StaticPageAgent);
    await server.launch();
    serverBase = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('post context', async () => {
    const contextValue = 'bar';
    const res = await fetch(`${serverBase}/playground-with-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: contextValue,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const contextId = data.uuid;

    // retrieve context
    const contextRes = await fetch(`${serverBase}/context/${contextId}`);
    const context = await contextRes.json();
    expect(context).toBeDefined();
    expect(context.context).toBe(contextValue);
  });
});
