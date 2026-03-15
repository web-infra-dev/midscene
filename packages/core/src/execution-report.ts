import { join } from 'node:path';
import {
  MIDSCENE_REPORT_QUIET,
  globalConfigManager,
} from '@midscene/shared/env';
import { logMsg } from '@midscene/shared/utils';
import { ExecutionStore } from './execution-store';
import { reportHTMLContent } from './utils';

export function exportExecutionReport(
  executionId: string,
  store: ExecutionStore = new ExecutionStore(),
): string {
  const dump = store.buildGroupedDump(executionId);
  const reportPath = join(store.reportDir(executionId), 'index.html');

  reportHTMLContent(JSON.stringify(dump), reportPath, false);
  store.markReportGenerated(executionId, reportPath);

  if (!globalConfigManager.getEnvConfigInBoolean(MIDSCENE_REPORT_QUIET)) {
    logMsg(`Midscene - report generated: ${reportPath}`);
  }

  return reportPath;
}
