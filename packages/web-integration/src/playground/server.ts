import assert from 'node:assert';
import type { Server } from 'node:http';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@/common/utils';
import cors from 'cors';
import express from 'express';
import { StaticPageAgent } from './agent';
import StaticPage from './static-page';

const defaultPort = 5800;
let requestCount = 1;
export default class PlaygroundServer {
  app: express.Application;
  server?: Server;
  port?: number | null;
  constructor(port?: number) {
    this.app = express();
  }

  async launch() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '30mb' }));

    this.app.get('/playground/status', async (req, res) => {
      res.send({
        status: 'ok',
      });
    });

    this.app.post('/playground/execute', async (req, res) => {
      const { context, type, prompt } = req.body;
      assert(context, 'context is required');
      assert(type, 'type is required');
      assert(prompt, 'prompt is required');
      const requestId = requestCount++;
      console.log(`handle request: #${requestId}, ${type}, ${prompt}`);

      // build an agent with context
      const page = new StaticPage(context);
      const agent = new StaticPageAgent(page);

      const response: {
        result: any;
        dump: string | null;
        error: string | null;
      } = {
        result: null,
        dump: null,
        error: null,
      };

      try {
        if (type === 'aiQuery') {
          response.result = await agent.aiQuery(prompt);
        } else if (type === 'aiAction') {
          response.result = await agent.aiAction(prompt);
        } else if (type === 'aiAssert') {
          response.result = await agent.aiAssert(prompt, undefined, {
            keepRawResponse: true,
          });
        } else {
          response.error = `Unknown type: ${type}`;
        }
      } catch (error: any) {
        if (!error.message.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
          response.error = error.message;
        }
      }
      try {
        response.dump = JSON.parse(agent.dumpDataString());
        agent.writeOutActionDumps();
      } catch (error: any) {
        console.error(`write out dump failed: #${requestId}, ${error.message}`);
      }

      res.send(response);
      if (response.error) {
        console.error(
          `handle request failed: #${requestId}, ${response.error}`,
        );
      } else {
        console.log(`handle request done: #${requestId}`);
      }
    });

    return new Promise((resolve, reject) => {
      const port = this.port || defaultPort;
      this.server = this.app.listen(port, () => {
        this.port = port;
        resolve(this);
      });
    });
  }

  close() {
    // close the server
    if (this.server) {
      return this.server.close();
    }
  }
}
