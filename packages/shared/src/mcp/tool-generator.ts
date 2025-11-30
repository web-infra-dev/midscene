import { parseBase64 } from '@midscene/shared/img';
import { z } from 'zod';
import type { ActionSpaceItem, BaseAgent, ToolDefinition } from './types';

/**
 * Converts DeviceAction from actionSpace into MCP ToolDefinition
 * This is the core logic that removes need for hardcoded tool definitions
 */
export function generateToolsFromActionSpace(
  actionSpace: ActionSpaceItem[],
  getAgent: () => Promise<BaseAgent>,
): ToolDefinition[] {
  return actionSpace.map((action) => {
    // Extract the shape from Zod schema if it exists
    // For z.object({ locate: ... }), we want to get the shape (the fields inside)
    let schema: Record<string, z.ZodTypeAny> = {};
    if (action.paramSchema) {
      const paramSchema = action.paramSchema as z.ZodTypeAny;
      // If it's a ZodObject, extract its shape
      if (
        '_def' in paramSchema &&
        paramSchema._def?.typeName === 'ZodObject' &&
        'shape' in paramSchema
      ) {
        schema = (paramSchema as z.ZodObject<z.ZodRawShape>).shape;
      } else {
        // Otherwise use it as-is
        schema = paramSchema as unknown as Record<string, z.ZodTypeAny>;
      }
    }

    return {
      name: action.name,
      description: action.description || `Execute ${action.name} action`,
      schema,
      handler: async (args: Record<string, unknown>) => {
        const agent = await getAgent();

        // Call the action through agent's action method
        // args already contains the unwrapped parameters (e.g., { locate: {...} })
        if ('aiAction' in agent && typeof agent.aiAction === 'function') {
          await (
            agent as BaseAgent & {
              aiAction: (
                desc: string,
                params: Record<string, unknown>,
              ) => Promise<void>;
            }
          ).aiAction(`Use the action "${action.name}"`, {
            ...args,
          });
        }

        // Return screenshot after action
        const screenshot = await agent.page?.screenshotBase64();
        if (!screenshot) {
          return {
            content: [
              {
                type: 'text',
                text: `Action "${action.name}" completed.`,
              },
            ],
          };
        }

        const { mimeType, body } = parseBase64(screenshot);

        return {
          content: [
            {
              type: 'text',
              text: `Action "${action.name}" completed.`,
            },
            {
              type: 'image',
              data: body,
              mimeType,
            },
          ],
        };
      },
      autoDestroy: true,
    };
  });
}

/**
 * Generate common tools (screenshot, waitFor)
 * SIMPLIFIED: Only keep essential helper tools, removed assert
 */
export function generateCommonTools(
  getAgent: () => Promise<BaseAgent>,
): ToolDefinition[] {
  return [
    {
      name: 'take_screenshot',
      description: 'Capture screenshot of current page/screen',
      schema: {},
      handler: async () => {
        const agent = await getAgent();
        const screenshot = await agent.page?.screenshotBase64();
        if (!screenshot) {
          return {
            content: [{ type: 'text', text: 'Screenshot not available' }],
            isError: true,
          };
        }
        const { mimeType, body } = parseBase64(screenshot);
        return {
          content: [{ type: 'image', data: body, mimeType }],
        };
      },
      autoDestroy: true,
    },
    {
      name: 'wait_for',
      description: 'Wait until condition becomes true',
      schema: {
        assertion: z.string().describe('Condition to wait for'),
        timeoutMs: z.number().optional().default(15000),
        checkIntervalMs: z.number().optional().default(3000),
      },
      handler: async (args) => {
        const agent = await getAgent();
        const { assertion, timeoutMs, checkIntervalMs } = args as {
          assertion: string;
          timeoutMs?: number;
          checkIntervalMs?: number;
        };

        if ('aiWaitFor' in agent && typeof agent.aiWaitFor === 'function') {
          await (
            agent as BaseAgent & {
              aiWaitFor: (
                assertion: string,
                options: Record<string, unknown>,
              ) => Promise<void>;
            }
          ).aiWaitFor(assertion, { timeoutMs, checkIntervalMs });
        }

        return {
          content: [{ type: 'text', text: `Condition met: "${assertion}"` }],
          isError: false,
        };
      },
      autoDestroy: true,
    },
  ];
}
