import { join } from 'node:path';
import {
  MIDSCENE_REPORT_QUIET,
  globalConfigManager,
} from '@midscene/shared/env';
import { logMsg } from '@midscene/shared/utils';
import { z } from 'zod';
import { ExecutionStore } from './execution-store';
import { getReportTpl } from './utils';

export function exportSessionReport(
  sessionId: string,
  store: ExecutionStore = new ExecutionStore(),
): string {
  const reportPath = join(store.reportDir(sessionId), 'index.html');
  const tpl = getReportTpl();

  if (!tpl) {
    console.warn('reportTpl is not set, will not write report');
    return '';
  }

  store.streamReportToFile(sessionId, reportPath, tpl);
  store.markReportGenerated(sessionId, reportPath);

  if (!globalConfigManager.getEnvConfigInBoolean(MIDSCENE_REPORT_QUIET)) {
    logMsg(`Midscene - report generated: ${reportPath}`);
  }

  return reportPath;
}

/**
 * Create a platform-agnostic MCP tool definition for exporting session reports.
 * Eliminates the need for each platform to duplicate the same handler.
 */
export function createExportSessionReportTool() {
  return {
    name: 'export_session_report',
    description: 'Generate a merged HTML report from a persisted session',
    schema: {
      sessionId: z.string().describe('Persistent session ID to export'),
    },
    handler: async (args: { sessionId?: string }) => {
      const { sessionId } = args;
      if (typeof sessionId !== 'string' || !sessionId) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'sessionId is required to export a session report',
            },
          ],
          isError: true,
        };
      }
      const reportPath = exportSessionReport(sessionId);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Session report generated: ${reportPath}`,
          },
        ],
      };
    },
  };
}
