import { z } from 'zod';
import { getErrorMessage } from '../agent-tools/error-formatter';
import { resolveObservationArtifactAdapter } from '../agent-tools/observation-artifact';
import { writeUIObservationRecord } from '../agent-tools/observation-record';
import type {
  BaseAgent,
  ToolCliMetadata,
  ToolDefinition,
  ToolResult,
  ToolSchema,
} from '../agent-tools/types';
import { waitForCliInterrupt } from './interrupt';
import { attachCliVerboseDumpListener, emitCliVerboseEvent } from './verbose';

const recordCliMetadata: ToolCliMetadata = {
  positionals: ['action'],
  options: {
    intervalMs: {
      preferredName: 'interval-ms',
      aliases: ['intervalMs'],
    },
    maxFrames: {
      preferredName: 'max-frames',
      aliases: ['maxFrames'],
    },
    watchdogMs: {
      preferredName: 'watchdog-ms',
      aliases: ['watchdogMs'],
    },
    action: {
      hidden: true,
    },
  },
};

function mergeCliMetadata(
  base: ToolCliMetadata,
  extra?: ToolCliMetadata,
): ToolCliMetadata {
  return {
    positionals: base.positionals,
    options: {
      ...(base.options ?? {}),
      ...(extra?.options ?? {}),
    },
  };
}

function createErrorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/** Create the foreground recording command exposed only by Midscene CLIs. */
export function createRecordCliCommand(
  getAgent: (args?: Record<string, unknown>) => Promise<BaseAgent>,
  initArgSchema: ToolSchema = {},
  initArgCliMetadata?: ToolCliMetadata,
): ToolDefinition {
  return {
    name: 'record',
    description:
      'Record the page/screen in the foreground until Ctrl+C, then save the ordered frame window for a later assert command.',
    schema: {
      action: z
        .literal('start')
        .describe('Start a foreground recording. Press Ctrl+C to finish.'),
      output: z
        .string()
        .optional()
        .describe(
          'Path for the JSON observation manifest. Frames are stored in an adjacent <name>.frames directory. Defaults to a generated path under midscene_run/output.',
        ),
      intervalMs: z
        .number()
        .min(200)
        .optional()
        .describe(
          'Sampling interval in milliseconds. Defaults to 1000; minimum 200 (5fps).',
        ),
      maxFrames: z
        .number()
        .int()
        .min(2)
        .optional()
        .describe('Maximum buffered frames. Defaults to 30; minimum 2.'),
      watchdogMs: z
        .number()
        .min(0)
        .optional()
        .describe(
          'Safety timeout in milliseconds. Defaults to 300000 (5 minutes); 0 disables it.',
        ),
      ...initArgSchema,
    },
    cli: mergeCliMetadata(recordCliMetadata, initArgCliMetadata),
    handler: async (
      args: Record<string, unknown> = {},
    ): Promise<ToolResult> => {
      if (args.action !== 'start') {
        return createErrorResult(
          'record requires the start operation (for example: record start --output ./observation.json)',
        );
      }

      try {
        const agent = await getAgent(args);
        emitCliVerboseEvent({ event: 'agent_ready', tool: 'record' });
        if (!agent.startObserving) {
          throw new Error(
            'record is not supported because this agent does not provide startObserving',
          );
        }
        const observationArtifacts = resolveObservationArtifactAdapter(agent);
        if (!observationArtifacts) {
          throw new Error(
            'record is not supported because this agent does not provide observation artifact persistence',
          );
        }
        const unsubscribeVerbose = attachCliVerboseDumpListener(agent, {
          toolName: 'record',
        });
        let observer:
          | Awaited<ReturnType<NonNullable<BaseAgent['startObserving']>>>
          | undefined;
        try {
          const watchdogMs = (args.watchdogMs as number | undefined) ?? 300_000;
          observer = await agent.startObserving({
            intervalMs: args.intervalMs as number | undefined,
            maxFrames: args.maxFrames as number | undefined,
            watchdogMs,
          });
          emitCliVerboseEvent({
            event: 'recording_ready',
            tool: 'record',
            watchdogMs,
          });
          const stopReason = await waitForCliInterrupt(watchdogMs);
          emitCliVerboseEvent({
            event: 'recording_stopping',
            tool: 'record',
            reason: stopReason,
          });
          const observation = await observer.stop();
          const record = await observationArtifacts.exportRecord(observation);
          const outputPath = writeUIObservationRecord(
            record,
            args.output as string | undefined,
          );
          return {
            content: [
              {
                type: 'text',
                text: `Observation record saved: ${outputPath}`,
              },
            ],
          };
        } finally {
          await observer?.dispose?.();
          unsubscribeVerbose();
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        console.error('Error executing record:', errorMessage);
        return createErrorResult(`Failed to execute record: ${errorMessage}`);
      }
    },
  };
}
