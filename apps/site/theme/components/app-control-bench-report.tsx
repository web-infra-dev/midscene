import {
  APP_CONTROL_BENCH_RUNS,
  getAppControlBenchReportUrl,
} from './app-control-bench-data';

const REPORT_COPY = {
  en: {
    overviewTableLabel: 'AppControlBench model results',
    model: 'Model',
    passAt1: 'Pass@1',
    result: 'Result',
    totalModelCost: 'Total Model Cost',
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
    passAt1: 'Pass@1',
    result: '结果',
    totalModelCost: '模型总成本',
    tableLabel: 'AppControlBench 任务执行结果',
    task: '任务',
    status: '状态',
    modelCost: '模型成本',
    report: '报告',
    reportLabel: '报告',
    reportTitle: '在新页面打开报告',
  },
} as const;

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
  vertical-align: middle;
}

.app-control-benchmark-overview-table th:nth-child(1),
.app-control-benchmark-overview-table td:nth-child(1) {
  width: 34%;
}

.app-control-benchmark-overview-table th:nth-child(2),
.app-control-benchmark-overview-table td:nth-child(2) {
  width: 14%;
  text-align: center;
}

.app-control-benchmark-overview-table th:nth-child(3),
.app-control-benchmark-overview-table td:nth-child(3) {
  width: 27%;
  text-align: center;
}

.app-control-benchmark-overview-table th:nth-child(4),
.app-control-benchmark-overview-table td:nth-child(4) {
  width: 25%;
  text-align: center;
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
                <th scope="col">{copy.passAt1}</th>
                <th scope="col">{copy.result}</th>
                <th scope="col">{copy.totalModelCost}</th>
              </tr>
            </thead>
            <tbody>
              {APP_CONTROL_BENCH_RUNS.map((run) => (
                <tr key={run.id}>
                  <td>{run.modelName}</td>
                  <td>{`${run.summary.passAt1.toFixed(2)}%`}</td>
                  <td>{`${run.summary.passCount} PASS · ${run.summary.partialCount} PARTIAL · ${run.summary.failCount} FAIL`}</td>
                  <td>
                    <span className="app-control-benchmark-cost">
                      {`$${run.summary.totalUsd.toFixed(4)}/¥${run.summary.totalCny.toFixed(4)}`}
                    </span>
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
