import { z } from 'zod';
import { splitReportHtmlByExecution } from './report';

type ReportCliToolResult = {
  isError: boolean;
  content: Array<{
    type: 'text';
    text: string;
  }>;
};

type ReportCliSchema = Record<string, z.ZodTypeAny>;

export interface ReportCliCommandDefinition {
  name: string;
  description: string;
  schema: ReportCliSchema;
  handler: (args: Record<string, unknown>) => Promise<ReportCliToolResult>;
}

export interface ReportCliCommandEntry {
  name: string;
  def: ReportCliCommandDefinition;
}

const reportCommandDefinition: ReportCliCommandDefinition = {
  name: 'report-tool',
  description:
    'Transform Midscene report artifacts, including splitting executions for downstream processing.',
  schema: {
    action: z
      .enum(['split'])
      .optional()
      .describe(
        'Report action to run. Currently supports: split. Defaults to split.',
      ),
    htmlPath: z
      .string()
      .optional()
      .describe('Input report HTML path (e.g. ./report/index.html)'),
    outputDir: z
      .string()
      .optional()
      .describe('Output directory for generated report artifacts'),
  },
  handler: async (args) => {
    const {
      action = 'split',
      htmlPath,
      outputDir,
    } = args as {
      action?: string;
      htmlPath?: string;
      outputDir?: string;
    };

    if (action !== 'split') {
      throw new Error(
        `report-tool: unsupported --action value "${action}". Currently supported: split`,
      );
    }

    if (!htmlPath) {
      throw new Error(
        'report-tool: --htmlPath is required when --action=split',
      );
    }
    if (!outputDir) {
      throw new Error(
        'report-tool: --outputDir is required when --action=split',
      );
    }

    const result = splitReportHtmlByExecution({ htmlPath, outputDir });

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `Report split completed. Generated ${result.executionJsonFiles.length} execution JSON files and ${result.screenshotFiles.length} screenshots. Output path: ${outputDir}`,
        },
      ],
    };
  },
};

export function createReportCliCommands(): ReportCliCommandEntry[] {
  return [
    {
      name: 'report-tool',
      def: reportCommandDefinition,
    },
  ];
}
