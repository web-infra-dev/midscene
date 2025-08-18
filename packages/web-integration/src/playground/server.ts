import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@/common/utils';
import { getTmpDir } from '@midscene/core/utils';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { overrideAIConfig } from '@midscene/shared/env';
import { ifInBrowser, ifInWorker } from '@midscene/shared/utils';
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
  if (!ifInBrowser && !ifInWorker) {
    dotenv.config();
  }
};

export default class PlaygroundServer {
  app: express.Application;
  tmpDir: string;
  server?: Server;
  port?: number | null;
  pageClass: new (
    ...args: any[]
  ) => AbstractPage;
  agentClass: new (
    ...args: any[]
  ) => PageAgent;
  staticPath?: string;
  taskProgressTips: Record<string, string>;
  activeAgents: Record<string, PageAgent>;

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
    this.activeAgents = {};
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

      if (!existsSync(contextFile)) {
        return res.status(404).json({
          error: 'Context not found',
        });
      }

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

        if (!context) {
          return res.status(400).json({
            error: 'context is required',
          });
        }

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
        const { context, type, prompt, requestId, deepThink } = req.body;

        if (!context) {
          return res.status(400).json({
            error: 'context is required',
          });
        }

        if (!type) {
          return res.status(400).json({
            error: 'type is required',
          });
        }

        if (!prompt) {
          return res.status(400).json({
            error: 'prompt is required',
          });
        }

        // build an agent with context
        const page = new this.pageClass(context);
        const agent = new this.agentClass(page);

        if (requestId) {
          this.taskProgressTips[requestId] = '';
          this.activeAgents[requestId] = agent;

          agent.onTaskStartTip = (tip: string) => {
            this.taskProgressTips[requestId] = tip;
          };
        }

        const response: {
          result: any;
          dump: string | null;
          error: string | null;
          reportHTML: string | null;
          requestId?: string;
        } = {
          result: null,
          dump: null,
          error: null,
          reportHTML: null,
          requestId,
        };

        const startTime = Date.now();
        try {
          // Parse parameters for certain methods
          if (type === 'aiQuery') {
            response.result = await agent.aiQuery(prompt);
          } else if (type === 'aiAction') {
            response.result = await agent.aiAction(prompt);
          } else if (type === 'aiAssert') {
            response.result = await agent.aiAssert(prompt, undefined, {
              keepRawResponse: true,
            });
          } else if (type === 'aiTap') {
            response.result = await agent.aiTap(prompt, {
              deepThink,
            });
          } else if (type === 'aiHover') {
            response.result = await agent.aiHover(prompt, {
              deepThink,
            });
          } else if (type === 'aiRightClick') {
            response.result = await agent.aiRightClick(prompt, {
              deepThink,
            });
          } else if (type === 'aiLocate') {
            response.result = await agent.aiLocate(prompt, {
              deepThink,
            });
          } else if (type === 'aiInput') {
            // Parse format: "value | element"
            const parts = prompt.split('|').map((s: string) => s.trim());
            if (parts.length !== 2) {
              response.error = 'aiInput requires format: "value | element"';
            } else {
              response.result = await agent.aiInput(parts[0], parts[1], {
                deepThink,
              });
            }
          } else if (type === 'aiKeyboardPress') {
            // Parse format: "key | element (optional)"
            const parts = prompt.split('|').map((s: string) => s.trim());
            const keyName = parts[0];
            const element = parts[1] || undefined;
            response.result = await agent.aiKeyboardPress(keyName, element, {
              deepThink,
            });
          } else if (type === 'aiScroll') {
            // Parse format: "direction amount | element (optional)"
            // Example: "down 500 | main content"
            const parts = prompt.split('|').map((s: string) => s.trim());
            const scrollParts = parts[0]
              .split(' ')
              .map((s: string) => s.trim());

            if (scrollParts.length < 2) {
              response.error =
                'aiScroll requires format: "direction amount | element (optional)"';
            } else {
              const direction = scrollParts[0];
              const amount = Number.parseInt(scrollParts[1]);
              const element = parts[1] || undefined;

              const scrollParam = {
                direction: direction as 'up' | 'down' | 'left' | 'right',
                scrollType: 'once' as const,
                distance: amount,
              };

              response.result = await agent.aiScroll(scrollParam, element);
            }
          } else if (type === 'aiBoolean') {
            response.result = await agent.aiBoolean(prompt);
          } else if (type === 'aiNumber') {
            response.result = await agent.aiNumber(prompt);
          } else if (type === 'aiString') {
            response.result = await agent.aiString(prompt);
          } else if (type === 'aiAsk') {
            response.result = await agent.aiAsk(prompt);
          } else if (type === 'aiWaitFor') {
            // aiWaitFor with default timeout of 15 seconds
            response.result = await agent.aiWaitFor(prompt, {
              timeoutMs: 15000,
              checkIntervalMs: 3000,
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
          agent.destroy();
        } catch (error: any) {
          console.error(
            `write out dump failed: requestId: ${requestId}, ${error.message}`,
          );
        }

        res.send(response);
        const timeCost = Date.now() - startTime;

        if (response.error) {
          console.error(
            `handle request failed after ${timeCost}ms: requestId: ${requestId}, ${response.error}`,
          );
        } else {
          console.log(
            `handle request done after ${timeCost}ms: requestId: ${requestId}`,
          );
        }

        // Clean up the agent from activeAgents after execution completes
        if (requestId && this.activeAgents[requestId]) {
          delete this.activeAgents[requestId];
        }
      },
    );

    this.app.get('/cancel/:requestId', async (req, res) => {
      const { requestId } = req.params;

      if (!requestId) {
        return res.status(400).json({
          error: 'requestId is required',
        });
      }

      const agent = this.activeAgents[requestId];
      if (!agent) {
        return res.status(404).json({
          error: 'No active agent found for this requestId',
        });
      }

      try {
        await agent.destroy();
        delete this.activeAgents[requestId];
        res.json({ status: 'cancelled' });
      } catch (error: any) {
        console.error(`Failed to cancel agent: ${error.message}`);
        res.status(500).json({
          error: `Failed to cancel: ${error.message}`,
        });
      }
    });

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
      this.app.get('/', (req, res) => {
        // compatible with windows
        res.redirect('/index.html');
      });

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
