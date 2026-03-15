import { join } from 'node:path';
import {
  MIDSCENE_REPORT_QUIET,
  globalConfigManager,
} from '@midscene/shared/env';
import { logMsg } from '@midscene/shared/utils';
import { ExecutionStore } from './execution-store';
import { reportHTMLContent } from './utils';

export function exportSessionReport(
  sessionId: string,
  store: ExecutionStore = new ExecutionStore(),
): string {
  const dump = store.buildGroupedDump(sessionId);
  const reportPath = join(store.reportDir(sessionId), 'index.html');

  reportHTMLContent(JSON.stringify(dump), reportPath, false);
  store.markReportGenerated(sessionId, reportPath);

  if (!globalConfigManager.getEnvConfigInBoolean(MIDSCENE_REPORT_QUIET)) {
    logMsg(`Midscene - report generated: ${reportPath}`);
  }

  return reportPath;
}
