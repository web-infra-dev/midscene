import { parseBase64 } from '@midscene/shared/img';
import { z } from 'zod';
import type { ToolDefinition } from './types';

// Generic type to avoid importing from @midscene/core
// The actual DeviceAction will be provided by implementation
interface GenericAction {
  name: string;
  description?: string;
  paramSchema?: any;
}

/**
 * Converts DeviceAction from actionSpace into MCP ToolDefinition
 * This is the core logic that removes need for hardcoded tool definitions
 */
export function generateToolsFromActionSpace(
  actionSpace: GenericAction[],
  getAgent: () => Promise<any>,
): ToolDefinition[] {
  return actionSpace.map((action) => ({
    name: action.name,
    description: action.description || `Execute ${action.name} action`,
    schema: action.paramSchema ? { param: action.paramSchema } : {},
    handler: async (args: any) => {
      const agent = await getAgent();

      // Extract actual parameters from the 'param' wrapper
      // MCP wraps parameters in { param: {...} }, so we need to unwrap it
      const actionParams = args.param || args;

      // Call the action through agent's action method
      await agent.aiAction(`Use the action "${action.name}"`, {
        planType: action.name,
        ...actionParams,
      });

      // Return screenshot after action
      const screenshot = await agent.page.screenshotBase64();
      const { mimeType, body } = parseBase64(screenshot);

      return {
        content: [
          {
            type: 'text',
            text: `Action "${action.name}" completed. Report: ${agent.reportFile}`,
          },
          {
            type: 'image',
            data: body,
            mimeType,
          },
        ],
        isError: false,
      };
    },
    autoDestroy: true,
  }));
}

/**
 * Generate common tools (screenshot, waitFor)
 * SIMPLIFIED: Only keep essential helper tools, removed assert
 */
export function generateCommonTools(
  getAgent: () => Promise<any>,
): ToolDefinition[] {
  return [
    {
      name: 'take_screenshot',
      description: 'Capture screenshot of current page/screen',
      schema: {},
      handler: async () => {
        const agent = await getAgent();
        const screenshot = await agent.page.screenshotBase64();
        const { mimeType, body } = parseBase64(screenshot);
        return {
          content: [{ type: 'image', data: body, mimeType }],
          isError: false,
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
      handler: async ({ assertion, timeoutMs, checkIntervalMs }) => {
        const agent = await getAgent();
        await agent.aiWaitFor(assertion, { timeoutMs, checkIntervalMs });
        return {
          content: [{ type: 'text', text: `Condition met: "${assertion}"` }],
          isError: false,
        };
      },
      autoDestroy: true,
    },
  ];
}
