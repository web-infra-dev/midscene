import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@/common/utils';
import { overrideAIConfig } from '@midscene/core/env';
import { getTmpDir } from '@midscene/core/utils';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { assert } from '@midscene/shared/utils';
import { ifInBrowser } from '@midscene/shared/utils';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import type { PageAgent } from '../common/agent';
import type { AbstractPage } from '../page';

const defaultPort = PLAYGROUND_SERVER_PORT;
// const staticPath = join(__dirname, '../../static');

const errorHandler = (err: any, req: any, res: any, next: any) => {
  console.error(err);
  res.status(500).json({
    error: err.message,
  });
};

const setup = async () => {
  if (!ifInBrowser) {
    dotenv.config();
  }
};

export default class PlaygroundServer {
  app: express.Application;
  tmpDir: string;
  server?: Server;
  port?: number | null;
  pageClass: new (...args: any[]) => AbstractPage;
  agentClass: new (...args: any[]) => PageAgent;
  staticPath?: string;
  taskProgressTips: Record<string, string>;

  constructor(
    pageClass: new (...args: any[]) => AbstractPage,
    agentClass: new (...args: any[]) => PageAgent,
    staticPath?: string,
  ) {
    this.app = express();
    this.tmpDir = getTmpDir()!;
    this.pageClass = pageClass;
    this.agentClass = agentClass;
    this.staticPath = staticPath;
    this.taskProgressTips = {};
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

  async launch(port?: number) {
    this.port = port || defaultPort;
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

    this.app.get('/task-progress/:requestId', cors(), async (req, res) => {
      const { requestId } = req.params;
      res.json({
        tip: this.taskProgressTips[requestId] || '',
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
        const { context, type, prompt, requestId } = req.body;
        assert(context, 'context is required');
        assert(type, 'type is required');
        assert(prompt, 'prompt is required');
        assert(requestId, 'requestId is required');

        this.taskProgressTips[requestId] = '';

        // build an agent with context
        const page = new this.pageClass(context);
        const agent = new this.agentClass(page);

        agent.onTaskStartTip = (tip: string) => {
          console.log(`task start tip: ${tip}`);
          this.taskProgressTips[requestId] = tip;
        };

        const response: {
          result: any;
          dump: string | null;
          error: string | null;
          requestId: string;
          reportHTML: string | null;
        } = {
          result: null,
          dump: null,
          error: null,
          requestId,
          reportHTML: null,
        };

        const startTime = Date.now();
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
          response.reportHTML = agent.reportHTMLString() || null;

          agent.writeOutActionDumps();
        } catch (error: any) {
          console.error(
            `write out dump failed: #${requestId}, ${error.message}`,
          );
        }

        setTimeout(() => {
          delete this.taskProgressTips[requestId];
        }, 60 * 1000);

        res.send(response);
        const timeCost = Date.now() - startTime;

        if (response.error) {
          console.error(
            `handle request failed after ${timeCost}ms: #${requestId}, ${response.error}`,
          );
        } else {
          console.log(`handle request done after ${timeCost}ms: #${requestId}`);
        }
      },
    );

    this.app.post(
      '/config',
      express.json({ limit: '1mb' }),
      async (req, res) => {
        const { aiConfig } = req.body;

        if (!aiConfig || typeof aiConfig !== 'object') {
          return res.status(400).json({
            error: 'aiConfig is required and must be an object',
          });
        }

        try {
          overrideAIConfig(aiConfig);

          return res.json({
            status: 'ok',
            message: 'AI config updated successfully',
          });
        } catch (error: any) {
          console.error(`Failed to update AI config: ${error.message}`);
          return res.status(500).json({
            error: `Failed to update AI config: ${error.message}`,
          });
        }
      },
    );

    // Set up static file serving after all API routes are defined
    if (this.staticPath) {
      this.app.get('*', (req, res) => {
        const requestedPath = join(this.staticPath!, req.path);
        if (existsSync(requestedPath)) {
          res.sendFile(requestedPath);
        } else {
          res.sendFile(join(this.staticPath!, 'index.html'));
        }
      });
    }

    return new Promise((resolve, reject) => {
      const port = this.port;
      this.server = this.app.listen(port, () => {
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
