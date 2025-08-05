import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StaticPageAgent } from '@/playground/agent';
import PlaygroundServer from '@/playground/server';
import StaticPage from '@/playground/static-page';
import { allConfigFromEnv } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dumpFilePath = join(__dirname, '../../fixtures/ui-context.json');
const context = readFileSync(dumpFilePath, { encoding: 'utf-8' });
const contextJson = JSON.parse(context);

describe(
  'static page agent',
  () => {
    let server: PlaygroundServer | null = null;
    
    afterEach(() => {
      // Clean up server if it exists
      if (server) {
        server.close();
        server = null;
      }
    });
    
    it('agent should work', async () => {
      const page = new StaticPage(contextJson);

      const agent = new StaticPageAgent(page);
      const content = await agent.aiQuery('tell me the content of the page');
      expect(content).toBeDefined();

      agent.writeOutActionDumps();
    });

    it('server should work', async () => {
      // Save current config before creating server
      const currentConfig = (globalThis as any).midsceneGlobalConfig;
      
      server = new PlaygroundServer(StaticPage, StaticPageAgent);
      
      // Restore config after server creation in case it was cleared
      if (!(globalThis as any).midsceneGlobalConfig || 
          Object.keys((globalThis as any).midsceneGlobalConfig || {}).length === 0) {
        (globalThis as any).midsceneGlobalConfig = currentConfig || allConfigFromEnv();
      }
      
      await server.launch();

      const port = server.port;
      if (!port) {
        throw new Error('port is not set');
      }

      const res = await fetch(`http://localhost:${port}/execute`, {
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
      expect(data.result).toBeDefined();
      expect(data.error).toBeFalsy();
    });
  },
  {
    timeout: 30 * 1000,
  },
);
