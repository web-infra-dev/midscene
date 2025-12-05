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
        const originalShape = (paramSchema as z.ZodObject<z.ZodRawShape>).shape;

        // Deep clone and modify the shape to make locate.prompt optional
        schema = Object.fromEntries(
          Object.entries(originalShape).map(([key, value]) => {
            // Unwrap ZodOptional if present to check the inner type
            let innerValue = value;
            let isOptional = false;
            if (
              innerValue &&
              typeof innerValue === 'object' &&
              '_def' in innerValue &&
              (innerValue as any)._def?.typeName === 'ZodOptional'
            ) {
              innerValue = (innerValue as any)._def.innerType;
              isOptional = true;
            }

            // Check if this is a locate field (contains prompt field)
            if (
              innerValue &&
              typeof innerValue === 'object' &&
              '_def' in innerValue &&
              (innerValue as any)._def?.typeName === 'ZodObject' &&
              'shape' in innerValue
            ) {
              const fieldShape = (innerValue as any).shape;
              if ('prompt' in fieldShape) {
                // This is a locate field, make prompt optional
                const newFieldShape = { ...fieldShape };
                newFieldShape.prompt = fieldShape.prompt.optional();
                let newSchema: z.ZodTypeAny = z
                  .object(newFieldShape)
                  .passthrough();
                // Re-wrap in optional if it was optional before
                if (isOptional) {
                  newSchema = newSchema.optional();
                }
                return [key, newSchema];
              }
            }
            return [key, value];
          }),
        );
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
        try {
          const agent = await getAgent();

          // Call the action through agent's aiAction method
          // args already contains the unwrapped parameters (e.g., { locate: {...} })
          if (agent.aiAction) {
            // Convert args object to natural language description
            let argsDescription = '';
            try {
              argsDescription = Object.entries(args)
                .map(([key, value]) => {
                  if (typeof value === 'object' && value !== null) {
                    try {
                      return `${key}: ${JSON.stringify(value)}`;
                    } catch {
                      return `${key}: [object]`;
                    }
                  }
                  return `${key}: "${value}"`;
                })
                .join(', ');
            } catch (error: unknown) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              // Only log errors to stderr (not stdout which MCP uses)
              console.error('Error serializing args:', errorMessage);
              argsDescription = `[args serialization failed: ${errorMessage}]`;
            }

            const instruction = argsDescription
              ? `Use the action "${action.name}" with ${argsDescription}`
              : `Use the action "${action.name}"`;

            try {
              await agent.aiAction(instruction);
            } catch (error: unknown) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              console.error(
                `Error executing action "${action.name}":`,
                errorMessage,
              );
              return {
                content: [
                  {
                    type: 'text',
                    text: `Failed to execute action "${action.name}": ${errorMessage}`,
                  },
                ],
                isError: true,
              };
            }
          }

          // Return screenshot after action
          try {
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
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error('Error capturing screenshot:', errorMessage);
            // Action completed but screenshot failed - still return success
            return {
              content: [
                {
                  type: 'text',
                  text: `Action "${action.name}" completed (screenshot unavailable: ${errorMessage})`,
                },
              ],
            };
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(`Error in handler for "${action.name}":`, errorMessage);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get agent or execute action "${action.name}": ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
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
        try {
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
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('Error taking screenshot:', errorMessage);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to capture screenshot: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
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
        try {
          const agent = await getAgent();
          const { assertion, timeoutMs, checkIntervalMs } = args as {
            assertion: string;
            timeoutMs?: number;
            checkIntervalMs?: number;
          };

          if (agent.aiWaitFor) {
            await agent.aiWaitFor(assertion, { timeoutMs, checkIntervalMs });
          }

          return {
            content: [{ type: 'text', text: `Condition met: "${assertion}"` }],
            isError: false,
          };
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('Error in wait_for:', errorMessage);
          return {
            content: [
              {
                type: 'text',
                text: `Wait condition failed: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      },
      autoDestroy: true,
    },
  ];
}
