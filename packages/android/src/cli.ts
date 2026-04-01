import { splitReportHtmlByExecution, z } from '@midscene/core';
import {
  CLIError,
  type CLIExtraCommand,
  runToolsCLI,
} from '@midscene/shared/cli';
import { AndroidMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new AndroidMidsceneTools();

const splitReportCommand: CLIExtraCommand = {
  name: 'split-report',
  def: {
    name: 'split-report',
    description:
      'Split Midscene report HTML into per-execution JSON files and externalized screenshots.',
    schema: {
      htmlPath: z
        .string()
        .describe('Input report HTML path (e.g. ./report/index.html)'),
      outputDir: z
        .string()
        .describe('Output directory for *.execution.json and screenshots/'),
    },
    handler: async (args) => {
      const { htmlPath, outputDir } = args as {
        htmlPath?: string;
        outputDir?: string;
      };
      if (!htmlPath) {
        throw new Error('split-report: --htmlPath is required');
      }
      if (!outputDir) {
        throw new Error('split-report: --outputDir is required');
      }

      const result = splitReportHtmlByExecution({ htmlPath, outputDir });
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `Split completed. Generated ${result.executionJsonFiles.length} execution JSON files and ${result.screenshotFiles.length} screenshots.`,
          },
        ],
      };
    },
  },
};

runToolsCLI(tools, 'midscene-android', {
  stripPrefix: 'android_',
  version: __VERSION__,
  extraCommands: [splitReportCommand],
}).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
