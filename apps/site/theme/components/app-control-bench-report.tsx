import {
  APP_CONTROL_BENCH_RUNS,
  type AppControlBenchRunSummary,
  getAppControlBenchReportUrl,
} from './app-control-bench-data';

const PARTIAL_COMPLETION_WEIGHT = 0.5;

const REPORT_COPY = {
  en: {
    overviewTableLabel: 'AppControlBench model results',
    model: 'Model',
    completion: 'Completion',
    timePerRun: 'Time / run',
    costPerRun: 'Cost / run',
    taskOutcomes: 'Task outcomes',
    passOutcome: 'Pass',
    partialOutcome: 'Partial',
    failOutcome: 'Fail',
    tableLabel: 'AppControlBench task execution results',
    task: 'Task',
    status: 'Status',
    modelCost: 'Model Cost',
    report: 'Report',
    reportLabel: 'report',
    reportTitle: 'Open report in a new page',
  },
  zh: {
    overviewTableLabel: 'AppControlBench 模型结果',
    model: '模型',
    completion: 'Completion',
    timePerRun: 'Time / run',
    costPerRun: 'Cost / run',
    taskOutcomes: 'Task outcomes',
    passOutcome: 'Pass',
    partialOutcome: 'Partial',
    failOutcome: 'Fail',
    tableLabel: 'AppControlBench 任务执行结果',
    task: '任务',
    status: '状态',
    modelCost: '模型成本',
    report: '报告',
    reportLabel: '报告',
    reportTitle: '在新页面打开报告',
  },
} as const;

function getTaskCount(summary: AppControlBenchRunSummary) {
  return summary.passCount + summary.partialCount + summary.failCount;
}

function getCompletionRate(summary: AppControlBenchRunSummary) {
  return (
    ((summary.passCount + summary.partialCount * PARTIAL_COMPLETION_WEIGHT) /
      getTaskCount(summary)) *
    100
  );
}

function formatDuration(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}

interface TaskOutcomeBarProps {
  failCount: number;
  labels: {
    fail: string;
    partial: string;
    pass: string;
  };
  partialCount: number;
  passAt1: number;
  passCount: number;
}

function TaskOutcomeBar({
  failCount,
  labels,
  partialCount,
  passAt1,
  passCount,
}: TaskOutcomeBarProps) {
  const outcomes = [
    { count: passCount, label: labels.pass, status: 'pass' },
    { count: partialCount, label: labels.partial, status: 'partial' },
    { count: failCount, label: labels.fail, status: 'fail' },
  ] as const;
  const tooltipText = [
    `Pass@1: ${passAt1.toFixed(2)}%`,
    ...outcomes.map(({ count, label }) => `${label}: ${count}`),
  ].join(' · ');

  return (
    <div
      aria-label={tooltipText}
      className="app-control-benchmark-outcomes-trigger"
      role="img"
    >
      <div aria-hidden="true" className="app-control-benchmark-outcomes">
        {outcomes.map(({ count, status }) =>
          count > 0 ? (
            <span
              className={`app-control-benchmark-outcome app-control-benchmark-outcome-${status}`}
              key={status}
              style={{ flexGrow: count }}
            />
          ) : null,
        )}
      </div>
      <span
        aria-hidden="true"
        className="app-control-benchmark-outcomes-tooltip"
      >
        {tooltipText}
      </span>
    </div>
  );
}

interface AppControlBenchReportProps {
  locale: keyof typeof REPORT_COPY;
  section?: 'all' | 'summary' | 'reports';
}

export function AppControlBenchReport({
  locale,
  section = 'all',
}: AppControlBenchReportProps) {
  const copy = REPORT_COPY[locale];
  const showSummary = section !== 'reports';
  const showReports = section !== 'summary';

  return (
    <>
      <style>{`
.app-control-benchmark-status {
  display: inline-flex;
  min-width: 56px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.app-control-benchmark-status-pass {
  color: #15803d;
  background: rgb(220 252 231 / 70%);
  border: 1px solid rgb(187 247 208 / 80%);
}

.app-control-benchmark-status-partial {
  color: #a16207;
  background: rgb(254 249 195 / 75%);
  border: 1px solid rgb(253 224 71 / 55%);
}

.app-control-benchmark-status-fail {
  color: #b91c1c;
  background: rgb(254 226 226 / 75%);
  border: 1px solid rgb(254 202 202 / 85%);
}

.dark .app-control-benchmark-status-pass {
  color: #86efac;
  background: rgb(22 101 52 / 35%);
  border-color: rgb(34 197 94 / 35%);
}

.dark .app-control-benchmark-status-partial {
  color: #fde047;
  background: rgb(113 63 18 / 35%);
  border-color: rgb(234 179 8 / 35%);
}

.dark .app-control-benchmark-status-fail {
  color: #fca5a5;
  background: rgb(127 29 29 / 35%);
  border-color: rgb(248 113 113 / 35%);
}

.app-control-benchmark-round > summary {
  cursor: pointer;
}

.app-control-benchmark-round {
  margin-top: 12px;
}

.app-control-benchmark-table-wrap {
  overflow-x: auto;
}

.app-control-benchmark-overview-table {
  display: table;
  width: 100%;
  min-width: 520px;
  table-layout: fixed;
}

.app-control-benchmark-overview-table th,
.app-control-benchmark-overview-table td {
  padding-inline: 6px;
  font-size: 13px;
  vertical-align: middle;
}

.app-control-benchmark-overview-table th {
  font-size: 12px;
  white-space: nowrap;
}

.app-control-benchmark-overview-table th:nth-child(1),
.app-control-benchmark-overview-table td:nth-child(1) {
  width: 28%;
}

.app-control-benchmark-overview-table th:nth-child(2),
.app-control-benchmark-overview-table td:nth-child(2) {
  width: 15%;
  text-align: center;
}

.app-control-benchmark-overview-table th:nth-child(3),
.app-control-benchmark-overview-table td:nth-child(3) {
  width: 14%;
  text-align: center;
}

.app-control-benchmark-overview-table th:nth-child(4),
.app-control-benchmark-overview-table td:nth-child(4) {
  width: 14%;
  text-align: center;
}

.app-control-benchmark-overview-table th:nth-child(5),
.app-control-benchmark-overview-table td:nth-child(5) {
  width: 29%;
}

.app-control-benchmark-outcomes-trigger {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 4px;
  outline: none;
}

.app-control-benchmark-outcomes {
  display: flex;
  height: 10px;
  min-width: 100px;
  gap: 2px;
  overflow: hidden;
  border-radius: 4px;
  background: #e5e7eb;
}

.app-control-benchmark-outcomes-tooltip {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 10;
  visibility: hidden;
  width: max-content;
  max-width: 320px;
  border-radius: 6px;
  padding: 7px 10px;
  color: #fff;
  background: #111827;
  box-shadow: 0 6px 18px rgb(15 23 42 / 22%);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 120ms ease,
    transform 120ms ease,
    visibility 120ms ease;
  white-space: nowrap;
}

.app-control-benchmark-outcomes-tooltip::before {
  position: absolute;
  right: 18px;
  bottom: 100%;
  width: 0;
  height: 0;
  border-right: 5px solid transparent;
  border-bottom: 5px solid #111827;
  border-left: 5px solid transparent;
  content: '';
}

.app-control-benchmark-outcomes-trigger:hover
  .app-control-benchmark-outcomes-tooltip {
  visibility: visible;
  opacity: 1;
  transform: translateY(0);
}

.app-control-benchmark-overview-table tbody tr:last-child
  .app-control-benchmark-outcomes-tooltip {
  top: auto;
  bottom: calc(100% + 8px);
}

.app-control-benchmark-overview-table tbody tr:last-child
  .app-control-benchmark-outcomes-tooltip::before {
  top: 100%;
  bottom: auto;
  border-top: 5px solid #111827;
  border-right: 5px solid transparent;
  border-bottom: 0;
  border-left: 5px solid transparent;
}

.app-control-benchmark-outcome {
  display: block;
  min-width: 2px;
  flex-basis: 0;
}

.app-control-benchmark-outcome-pass {
  background: #2f855a;
}

.app-control-benchmark-outcome-partial {
  background: #a17613;
}

.app-control-benchmark-outcome-fail {
  background: #ba3d3d;
}

.dark .app-control-benchmark-outcomes {
  background: #283041;
}

.app-control-benchmark-table {
  display: table;
  width: 100%;
  min-width: 500px;
  table-layout: fixed;
}

.app-control-benchmark-table th,
.app-control-benchmark-table td {
  vertical-align: middle;
}

.app-control-benchmark-table th:nth-child(1),
.app-control-benchmark-table td:nth-child(1) {
  width: 44px;
  text-align: center;
}

.app-control-benchmark-table th:nth-child(2),
.app-control-benchmark-table td:nth-child(2) {
  width: auto;
  word-break: break-word;
}

.app-control-benchmark-table th:nth-child(3),
.app-control-benchmark-table td:nth-child(3) {
  width: 90px;
  text-align: center;
}

.app-control-benchmark-table th:nth-child(4),
.app-control-benchmark-table td:nth-child(4) {
  width: 148px;
  text-align: center;
}

.app-control-benchmark-table th:nth-child(5),
.app-control-benchmark-table td:nth-child(5) {
  width: 76px;
  text-align: center;
}

.app-control-benchmark-cost {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.app-control-benchmark-report-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.app-control-benchmark-report-link::after {
  content: "↗";
  font-size: 0.9em;
  line-height: 1;
  transform: translateY(-1px);
}
`}</style>

      {showSummary && (
        <div className="app-control-benchmark-table-wrap">
          <table
            aria-label={copy.overviewTableLabel}
            className="app-control-benchmark-overview-table"
          >
            <thead>
              <tr>
                <th scope="col">{copy.model}</th>
                <th scope="col">{copy.completion}</th>
                <th scope="col">{copy.timePerRun}</th>
                <th scope="col">{copy.costPerRun}</th>
                <th scope="col">{copy.taskOutcomes}</th>
              </tr>
            </thead>
            <tbody>
              {APP_CONTROL_BENCH_RUNS.map((run) => (
                <tr key={run.id}>
                  <td>{run.modelName}</td>
                  <td>{`${Math.round(getCompletionRate(run.summary))}%`}</td>
                  <td>{formatDuration(run.summary.averageDurationSeconds)}</td>
                  <td>
                    <span className="app-control-benchmark-cost">
                      {`$${(run.summary.totalUsd / run.tasks.length).toFixed(4)}/¥${(run.summary.totalCny / run.tasks.length).toFixed(4)}`}
                    </span>
                  </td>
                  <td>
                    <TaskOutcomeBar
                      failCount={run.summary.failCount}
                      labels={{
                        fail: copy.failOutcome,
                        partial: copy.partialOutcome,
                        pass: copy.passOutcome,
                      }}
                      partialCount={run.summary.partialCount}
                      passAt1={run.summary.passAt1}
                      passCount={run.summary.passCount}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showReports &&
        APP_CONTROL_BENCH_RUNS.map((run, runIndex) => (
          <details
            className="app-control-benchmark-round"
            key={run.id}
            open={runIndex === 0}
          >
            <summary>
              {`${run.modelName} · Pass@1 ${run.summary.passAt1.toFixed(2)}% · ${run.summary.passCount} PASS · ${run.summary.partialCount} PARTIAL · ${run.summary.failCount} FAIL`}
            </summary>
            <div className="app-control-benchmark-table-wrap">
              <table
                aria-label={`${copy.tableLabel}: ${run.modelName}`}
                className="app-control-benchmark-table"
              >
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{copy.task}</th>
                    <th scope="col">{copy.status}</th>
                    <th scope="col">{copy.modelCost}</th>
                    <th scope="col">{copy.report}</th>
                  </tr>
                </thead>
                <tbody>
                  {run.tasks.map((task, taskIndex) => {
                    const index = taskIndex + 1;
                    const reportUrl = getAppControlBenchReportUrl(
                      run,
                      task,
                      taskIndex,
                    );

                    return (
                      <tr key={task.name}>
                        <td>{index}</td>
                        <td>{task.name}</td>
                        <td>
                          <span
                            className={`app-control-benchmark-status app-control-benchmark-status-${task.status.toLowerCase()}`}
                          >
                            {task.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className="app-control-benchmark-cost">
                            {`$${task.costUsd.toFixed(4)}/¥${task.costCny.toFixed(4)}`}
                          </span>
                        </td>
                        <td>
                          <a
                            className="app-control-benchmark-report-link"
                            href={reportUrl}
                            rel="noreferrer"
                            target="_blank"
                            title={copy.reportTitle}
                          >
                            {copy.reportLabel}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
    </>
  );
}
