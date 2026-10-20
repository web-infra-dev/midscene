import { basename } from 'node:path';
import type { Agent } from '@/agent/agent';
import type { MidsceneYamlScript } from '@/types';
import { ifInBrowser, ifInWorker } from '@midscene/shared/utils';
import { ReportGenerator } from '../report-generator';
import type { WorkflowExecutionRecord } from '../test-runner';
import { executionRecordsToReportInput } from '../test-runner/reporting/execution-record';
import { getVersion } from '../utils';
import { isYamlReportEnabled } from './report-policy';

interface PublishLegacyYamlReportOptions {
  agent: Agent | null;
  record: WorkflowExecutionRecord;
  runId: string;
  script: MidsceneYamlScript;
  scriptPath?: string;
  fallbackReportFileName?: string;
}

export interface PublishedLegacyYamlReport {
  record: WorkflowExecutionRecord;
  reportFile?: string | null;
}

/** Report publication is a host projection, not a ScriptPlayer state concern. */
export async function publishLegacyYamlReport(
  options: PublishLegacyYamlReportOptions,
): Promise<PublishedLegacyYamlReport> {
  const { agent, runId } = options;
  let record = options.record;
  if (agent) {
    const reportFile =
      (await agent._writeYamlExecutionReport?.(record)) ?? agent.reportFile;
    const source = await agent._createReportSource?.(runId);
    if (source) record = Object.freeze({ ...record, reportSources: [source] });
    return { record, reportFile };
  }
  if (ifInBrowser || ifInWorker || !isYamlReportEnabled(options.script))
    return { record };

  const generator = ReportGenerator.create(
    options.fallbackReportFileName ??
      options.script.agent?.reportFileName ??
      options.script.agent?.testId ??
      (options.scriptPath
        ? basename(options.scriptPath).replace(/\.ya?ml$/i, '')
        : `script-${runId}`),
    options.script.agent ?? {},
  );
  const reportFile = await generator.writeRunnerReport?.(
    executionRecordsToReportInput([record], { runId }),
    runId,
    {
      groupName: 'YAML execution',
      sdkVersion: getVersion(),
      modelBriefs: [],
    },
  );
  await generator.finalize();
  const source = await generator.createSourceSnapshot?.(runId);
  if (source) record = Object.freeze({ ...record, reportSources: [source] });
  return { record, reportFile };
}
