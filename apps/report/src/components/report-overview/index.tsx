import { Tooltip } from 'antd';
import { useMemo } from 'react';
import type { PlaywrightTasks } from '../../types';
import { PlaywrightCaseSelector } from '../playwright-case-selector';

import './index.less';
import { iconForStatus } from '@midscene/visualizer';

const ReportOverview = (props: {
  title: string;
  proModeEnabled?: boolean;
  onProModeChange?: (enabled: boolean) => void;
  dumps?: PlaywrightTasks[];
}): JSX.Element => {
  const testStats = useMemo(() => {
    if (!props.dumps || props.dumps.length === 0) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        passedTests: [],
        failedTests: [],
        skippedTests: [],
      };
    }

    const stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passedTests: [] as string[],
      failedTests: [] as string[],
      skippedTests: [] as string[],
    };

    props.dumps.forEach((dump) => {
      stats.total++;
      const status = dump.attributes?.playwright_test_status;
      const testName =
        (dump as { groupName?: string }).groupName ||
        dump.attributes?.playwright_test_title ||
        `Test ${stats.total}`;

      if (status === 'passed') {
        stats.passed++;
        stats.passedTests.push(testName);
      } else if (status === 'failed') {
        stats.failed++;
        stats.failedTests.push(testName);
      } else if (status === 'skipped') {
        stats.skipped++;
        stats.skippedTests.push(testName);
      }
    });

    return stats;
  }, [props.dumps]);

  const testStatsEl =
    props.dumps &&
    props.dumps.length > 0 &&
    props.dumps.every((dump) => dump.attributes?.playwright_test_id) ? (
      <div className="test-case-stats">
        <div className="stats-card">
          <div className="stats-value">{testStats.total}</div>
          <div className="stats-label">Total</div>
        </div>
        <Tooltip
          title={
            testStats.passedTests.length > 0 ? (
              <div>
                {testStats.passedTests.map((testName, index) => (
                  <div key={index}>
                    {iconForStatus('passed')} {testName}
                  </div>
                ))}
              </div>
            ) : null
          }
        >
          <div className="stats-card">
            <div className="stats-value stats-passed">{testStats.passed}</div>
            <div className="stats-label">Passed</div>
          </div>
        </Tooltip>
        <Tooltip
          title={
            testStats.failedTests.length > 0 ? (
              <div>
                {testStats.failedTests.map((testName, index) => (
                  <div key={index}>
                    {iconForStatus('failed')} {testName}
                  </div>
                ))}
              </div>
            ) : null
          }
        >
          <div className="stats-card">
            <div className="stats-value stats-failed">{testStats.failed}</div>
            <div className="stats-label">Failed</div>
          </div>
        </Tooltip>
      </div>
    ) : null;

  return (
    <div className="report-overview">
      {testStatsEl}
      <PlaywrightCaseSelector dumps={props.dumps} />
    </div>
  );
};

export default ReportOverview;
