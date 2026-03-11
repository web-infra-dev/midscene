import { join } from 'node:path';
import { SessionStore } from './session-store';
import { reportHTMLContent } from './utils';

export function exportSessionReport(sessionId: string): string {
  const dump = SessionStore.buildSessionDump(sessionId);
  const reportPath = join(SessionStore.reportDir(sessionId), 'index.html');

  reportHTMLContent(JSON.stringify(dump), reportPath, false);
  SessionStore.markReportGenerated(sessionId, reportPath);

  return reportPath;
}
