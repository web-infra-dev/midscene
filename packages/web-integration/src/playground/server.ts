import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import type { Agent as PageAgent } from '@midscene/core/agent';
import type { AbstractPage } from '@midscene/core/device';
import { getTmpDir } from '@midscene/core/utils';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@midscene/shared/common';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { overrideAIConfig } from '@midscene/shared/env';
import { ifInBrowser, ifInWorker } from '@midscene/shared/utils';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

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
        const { context, type, prompt, params, requestId, deepThink } =
          req.body;

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

        if (!prompt && !params) {
          return res.status(400).json({
            error: 'prompt or params is required',
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

        // Helper function to parse action parameters based on type
        const parseActionParams = (
          actionType: string,
          inputPrompt: string | undefined,
          inputParams: any | undefined,
          options: { deepThink?: boolean } = {},
        ): any[] => {
          // If structured params are provided, use them directly
          if (inputParams) {
            switch (actionType) {
              case 'aiInput': {
                if (!inputParams.value || !inputParams.locate) {
                  throw new Error(
                    'aiInput requires both value and locate parameters',
                  );
                }
                return [
                  inputParams.locate,
                  { value: inputParams.value, ...options },
                ];
              }

              case 'aiKeyboardPress': {
                if (!inputParams.keyName) {
                  throw new Error('aiKeyboardPress requires keyName parameter');
                }
                return [
                  inputParams.locate,
                  { keyName: inputParams.keyName, ...options },
                ];
              }

              case 'aiScroll': {
                if (!inputParams.direction || !inputParams.distance) {
                  throw new Error(
                    'aiScroll requires direction and distance parameters',
                  );
                }
                const scrollParam = {
                  direction: inputParams.direction as
                    | 'up'
                    | 'down'
                    | 'left'
                    | 'right',
                  scrollType: inputParams.scrollType || 'once',
                  distance: inputParams.distance,
                  ...options,
                };
                return [inputParams.locate, scrollParam];
              }

              default:
                // For other actions that only need locate prompt
                return [
                  inputParams.locate || inputParams.prompt || inputPrompt,
                  options,
                ];
            }
          }

          // Fallback to legacy prompt parsing for backward compatibility
          if (!inputPrompt) {
            throw new Error(`Missing prompt for ${actionType}`);
          }

          switch (actionType) {
            case 'aiInput': {
              const inputParts = inputPrompt
                .split('|')
                .map((s: string) => s.trim());
              if (inputParts.length !== 2) {
                throw new Error('aiInput requires format: "value | element"');
              }
              return [inputParts[1], { value: inputParts[0], ...options }];
            }

            case 'aiKeyboardPress': {
              const keyParts = inputPrompt
                .split('|')
                .map((s: string) => s.trim());
              const keyName = keyParts[0];
              const keyElement = keyParts[1] || undefined;
              return [keyElement, { keyName, ...options }];
            }

            case 'aiScroll': {
              const scrollParts = inputPrompt
                .split('|')
                .map((s: string) => s.trim());
              const scrollArgs = scrollParts[0]
                .split(' ')
                .map((s: string) => s.trim());

              if (scrollArgs.length < 2) {
                throw new Error(
                  'aiScroll requires format: "direction amount | element (optional)"',
                );
              }

              const direction = scrollArgs[0] as
                | 'up'
                | 'down'
                | 'left'
                | 'right';
              const amount = Number.parseInt(scrollArgs[1]);
              const scrollElement = scrollParts[1] || undefined;

              const scrollParam = {
                direction,
                scrollType: 'once' as const,
                distance: amount,
                ...options,
              };

              return [scrollElement, scrollParam];
            }

            default:
              return [inputPrompt, options];
          }
        };

        const startTime = Date.now();
        try {
          // Get action space to check for dynamic actions
          const actionSpace = await agent.getActionSpace();

          // Check if this is an action in the actionSpace
          const action = actionSpace.find(
            (action) => action.interfaceAlias === type || action.name === type,
          );

          if (
            action?.interfaceAlias &&
            typeof (agent as any)[action.interfaceAlias] === 'function'
          ) {
            // Use actionSpace method dynamically
            const parsedParams = parseActionParams(type, prompt, params, {
              deepThink,
            });
            response.result = await (agent as any)[action.interfaceAlias](
              ...parsedParams,
            );
          } else {
            // Get the prompt from either prompt field or params.prompt
            const actualPrompt = prompt || params?.prompt;

            if (!actualPrompt) {
              throw new Error(`Missing prompt for ${type}`);
            }

            // special handle for methods that need custom parameters or return format
            if (type === 'aiAssert') {
              response.result = await agent.aiAssert(actualPrompt, undefined, {
                keepRawResponse: true,
              });
            } else if (agent && typeof (agent as any)[type] === 'function') {
              // for other methods, check if the agent has the method
              response.result = await (agent as any)[type](actualPrompt, {
                deepThink,
              });
            } else {
              response.error = `Unknown type: ${type}`;
            }
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
