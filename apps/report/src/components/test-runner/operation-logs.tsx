import type { TestRunReportDump } from '@midscene/core';

export function OperationLogs({
  logs,
}: { logs: TestRunReportDump['operationLogs'] }): JSX.Element | null {
  if (!logs?.length) return null;
  return (
    <details>
      <summary>Operation event logs</summary>
      <p>
        Late operation outcomes are appended to these files. The report remains
        a snapshot of the run at its publication boundary.
      </p>
      <ul>
        {logs.map((log) => (
          <li key={`${log.path}:${log.snapshotAt}`}>
            {log.path} (snapshot: {log.snapshotAt})
          </li>
        ))}
      </ul>
    </details>
  );
}
