import { join } from 'node:path';
import { z } from 'zod';
import { SessionStore } from './session-store';
import { reportHTMLContent } from './utils';

export function exportSessionReport(sessionId: string): string {
  const dump = SessionStore.buildSessionDump(sessionId);
  const reportPath = join(SessionStore.reportDir(sessionId), 'index.html');

  reportHTMLContent(JSON.stringify(dump), reportPath, false);
  SessionStore.markReportGenerated(sessionId, reportPath);

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
    handler: async (args: Record<string, unknown>) => {
      const sessionId = args.sessionId;
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
