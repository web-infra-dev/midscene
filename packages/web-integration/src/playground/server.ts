import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@/common/utils';
import { getTmpDir } from '@midscene/core/utils';
import { ifInBrowser } from '@midscene/shared/utils';
import cors from 'cors';
import express from 'express';
import { StaticPageAgent } from './agent';
import StaticPage from './static-page';

const defaultPort = 5800;
// const staticPath = join(__dirname, '../../static');
let agentRequestCount = 1;

const errorHandler = (err: any, req: any, res: any, next: any) => {
  console.error(err);
  res.status(500).json({
    error: err.message,
  });
};

const setup = async () => {
  if (!ifInBrowser) {
    const dotenv = await import('dotenv');
    dotenv.config();
  }
};

export default class PlaygroundServer {
  app: express.Application;
  tmpDir: string;
  server?: Server;
  port?: number | null;
  constructor() {
    this.app = express();
    this.tmpDir = getTmpDir()!;
    setup();
  }

  filePathForUuid(uuid: string) {
    return join(this.tmpDir, `${uuid}.json`);
  }

  saveContextFile(uuid: string, context: string) {
    const tmpFile = this.filePathForUuid(uuid);
    console.log(`save context file: ${tmpFile}`);
    writeFileSync(tmpFile, context);
    return tmpFile;
  }

  async launch() {
    this.app.use(errorHandler);

    this.app.use(
      cors({
        origin: '*',
        credentials: true,
      }),
    );

    this.app.get('/status', cors(), async (req, res) => {
      // const modelName = g
      res.send({
        status: 'ok',
      });
    });

    // Serve index.html for the root route
    // this.app.get('/', (req, res) => {
    //   res.sendFile(join(staticPath, 'index.html'));
    // });

    // this.app.get('/playground/:uuid', async (req, res) => {
    //   res.sendFile(join(staticPath, 'index.html'));
    // });

    this.app.get('/context/:uuid', async (req, res) => {
      const { uuid } = req.params;
      const contextFile = this.filePathForUuid(uuid);
      assert(existsSync(contextFile), 'Context not found');
      const context = readFileSync(contextFile, 'utf8');
      res.json({
        context,
      });
    });

    // -------------------------
    // actions from report file
    this.app.post(
      '/playground-with-context',
      express.json({ limit: '50mb' }),
      async (req, res) => {
        const context = req.body.context;
        assert(context, 'context is required');
        const uuid = randomUUID();
        this.saveContextFile(uuid, context);
        return res.json({
          location: `/playground/${uuid}`,
          uuid,
        });
      },
    );

    this.app.post(
      '/execute',
      express.json({ limit: '30mb' }),
      async (req, res) => {
        const { context, type, prompt } = req.body;
        assert(context, 'context is required');
        assert(type, 'type is required');
        assert(prompt, 'prompt is required');
        const requestId = agentRequestCount++;
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
            response.result = await agent.aiToTarget(prompt);
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
          console.error(
            `write out dump failed: #${requestId}, ${error.message}`,
          );
        }

        res.send(response);
        if (response.error) {
          console.error(
            `handle request failed: #${requestId}, ${response.error}`,
          );
        } else {
          console.log(`handle request done: #${requestId}`);
        }
      },
    );

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
