import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StaticPageAgent } from '@/playground/agent';
import PlaygroundServer from '@/playground/server';
import StaticPage from '@/playground/static-page';
import { describe, expect, it } from 'vitest';

const dumpFilePath = join(__dirname, '../../fixtures/ui-context.json');
const context = readFileSync(dumpFilePath, { encoding: 'utf-8' });
const contextJson = JSON.parse(context);

describe(
  'static page agent',
  () => {
    it('agent should work', async () => {
      const page = new StaticPage(contextJson);

      const agent = new StaticPageAgent(page);
      const content = await agent.aiQuery('tell me the content of the page');
      console.log('content', content);
      expect(content).toBeDefined();

      agent.writeOutActionDumps();
    });

    it('server should work', async () => {
      const server = new PlaygroundServer();
      await server.launch();

      const port = server.port;
      if (!port) {
        throw new Error('port is not set');
      }

      const res = await fetch(`http://localhost:${port}/playground/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: contextJson,
          type: 'aiQuery',
          prompt: 'tell me the content of the page',
        }),
      });

      const data = await res.json();
      console.log('data', data);
      expect(data.result).toBeDefined();
      expect(data.error).toBeFalsy();
      server.close();
    });
  },
  {
    timeout: 30 * 1000,
  },
);
