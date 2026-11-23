import { link, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

/** Render an inline Agent dump without running the workflow or opening a browser. */
export async function renderAgentReport(serialized, output) {
  if (extname(output).toLowerCase() !== '.html')
    throw new Error('Native report output must be an .html file');
  const { ReportActionDump, ReportGenerator } = await import('@midscene/core');
  const { executions, ...meta } =
    ReportActionDump.fromSerializedString(serialized);
  if (!executions.length)
    throw new Error('REPORT_EMPTY: the Agent dump contains no executions');
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const temp = await mkdtemp(join(parent, '.replay-report-'));
  try {
    const path = join(temp, 'report.html');
    const generator = new ReportGenerator({
      reportPath: path,
      screenshotMode: 'inline',
      autoPrint: false,
    });
    for (const execution of executions)
      generator.onExecutionUpdate(execution, meta);
    await generator.finalize();
    // Publish only a complete report, and preserve an existing output.
    await link(path, output);
    return output;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
