import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import type { Agent as PageAgent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core/device';
import { getTmpDir } from '@midscene/core/utils';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { overrideAIConfig } from '@midscene/shared/env';
import { ifInBrowser, ifInWorker } from '@midscene/shared/utils';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { executeAction, formatErrorMessage } from './common';
import type { PlaygroundAgent } from './types';

const defaultPort = PLAYGROUND_SERVER_PORT;

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
  ) => AbstractInterface;
  agentClass: new (
    ...args: any[]
  ) => PageAgent;
  staticPath?: string;
  taskProgressTips: Record<string, string>;
  activeAgents: Record<string, PageAgent>;

  constructor(
    pageClass: new (...args: any[]) => AbstractInterface,
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

    this.app.get('/status', async (req: Request, res: Response) => {
      // const modelName = g
      res.send({
        status: 'ok',
      });
    });

    this.app.get('/context/:uuid', async (req: Request, res: Response) => {
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

    this.app.get(
      '/task-progress/:requestId',
      async (req: Request, res: Response) => {
        const { requestId } = req.params;
        res.json({
          tip: this.taskProgressTips[requestId] || '',
        });
      },
    );

    this.app.post(
      '/action-space',
      express.json({ limit: '30mb' }),
      async (req: Request, res: Response) => {
        const { context } = req.body;

        try {
          let actionSpace: any[];

          // Check if we have an active agent to get action space from
          const activeAgentIds = Object.keys(this.activeAgents);
          if (activeAgentIds.length === 1) {
            // Use existing agent's action space
            const agentId = activeAgentIds[0];
            const agent = this.activeAgents[agentId];
            const page = (agent as any).interface;
            actionSpace = await page.actionSpace();
          } else if (context) {
            // Create temporary agent with context
            const page = new this.pageClass(context);
            actionSpace = await page.actionSpace();
          } else {
            return res.status(400).json({
              error: 'context is required when no active agent is available',
            });
          }

          // Process actionSpace to make paramSchema serializable
          const processedActionSpace = actionSpace.map((action: any) => {
            if (action.paramSchema && typeof action.paramSchema === 'object') {
              // Extract shape information from Zod schema
              let processedSchema = null;

              try {
                // Extract shape from runtime Zod object
                if (
                  action.paramSchema.shape &&
                  typeof action.paramSchema.shape === 'object'
                ) {
                  processedSchema = {
                    type: 'ZodObject',
                    shape: action.paramSchema.shape,
                  };
                }
              } catch (e) {
                console.warn(
                  'Failed to process paramSchema for action:',
                  action.name,
                  e,
                );
              }

              return {
                ...action,
                paramSchema: processedSchema,
              };
            }
            return action;
          });

          res.json(processedActionSpace);
        } catch (error: any) {
          console.error('Failed to get action space:', error);
          res.status(500).json({
            error: error.message,
          });
        }
      },
    );

    // -------------------------
    // actions from report file
    this.app.post(
      '/playground-with-context',
      express.json({ limit: '50mb' }),
      async (req: Request, res: Response) => {
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
      async (req: Request, res: Response) => {
        const {
          context,
          type,
          prompt,
          params,
          requestId,
          deepThink,
          screenshotIncluded,
          domIncluded,
        } = req.body;

        if (!type) {
          return res.status(400).json({
            error: 'type is required',
          });
        }

        // If we have exactly one active agent, use it directly (common case for playgroundForAgent)
        const activeAgentIds = Object.keys(this.activeAgents);
        let agent: PageAgent;
        let page: AbstractInterface;

        let isTemporaryAgent = false;
        if (activeAgentIds.length === 1) {
          // Single agent case - use it directly (ignore frontend requestId)
          const agentId = activeAgentIds[0];
          agent = this.activeAgents[agentId];
          page = (agent as any).interface as AbstractInterface;
        } else if (requestId && this.activeAgents[requestId]) {
          // Multi-agent case with specific requestId
          agent = this.activeAgents[requestId];
          page = (agent as any).interface as AbstractInterface;
        } else if (context) {
          // Create new agent with context
          page = new this.pageClass(context);
          agent = new this.agentClass(page);
          isTemporaryAgent = true;
        } else {
          return res.status(400).json({
            error: 'context is required when no active agent is available',
          });
        }

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
          // Get action space to check for dynamic actions
          const actionSpace = await page.actionSpace();

          // Prepare value object for executeAction
          const value = {
            type,
            prompt,
            params,
          };

          response.result = await executeAction(
            agent as unknown as PlaygroundAgent,
            type,
            actionSpace,
            value,
            {
              deepThink: deepThink || false,
              screenshotIncluded,
              domIncluded,
            },
          );
        } catch (error: any) {
          response.error = formatErrorMessage(error);
        }

        try {
          response.dump = JSON.parse(agent.dumpDataString());
          response.reportHTML = agent.reportHTMLString() || null;

          agent.writeOutActionDumps();

          // Only destroy temporary agents, keep pre-registered agents alive
          if (isTemporaryAgent) {
            agent.destroy();
          } else {
          }
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

    this.app.get('/cancel/:requestId', async (req: Request, res: Response) => {
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
      async (req: Request, res: Response) => {
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
      this.app.get('/', (_req: Request, res: Response) => {
        // compatible with windows
        res.redirect('/index.html');
      });

      this.app.get('*', (req: Request, res: Response) => {
        const requestedPath = join(this.staticPath!, req.path);
        if (existsSync(requestedPath)) {
          res.sendFile(requestedPath);
        } else {
          res.sendFile(join(this.staticPath!, 'index.html'));
        }
      });
    }

    return new Promise((resolve) => {
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
