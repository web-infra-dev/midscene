import { PlaygroundServer } from '@midscene/playground';
import { StaticPage, StaticPageAgent } from '@midscene/web/static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Playground Server', () => {
  let server: PlaygroundServer;
  let serverBase: string;
  beforeAll(async () => {
    const page = new StaticPage({
      tree: { node: null, children: [] },
      size: { width: 800, height: 600 },
      screenshotBase64: '',
    });
    const agent = new StaticPageAgent(page);
    server = new PlaygroundServer(page, agent);
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
