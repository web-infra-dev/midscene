import { AgentReportManager } from '@/agent/agent-report-manager';
import type { TaskRunner } from '@/task-runner';
import { ExecutionDump } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

const execution = (id: string) =>
  new ExecutionDump({ id, name: id, logTime: 0, tasks: [] });

describe('AgentReportManager without an Agent or device', () => {
  function createManager() {
    const options = {
      groupName: 'first group',
      generateReport: false,
      reportFileName: 'first-report',
    };
    const state = { destroyed: false, busy: false };
    const reports = new AgentReportManager({
      getOptions: () => options,
      getDeviceType: () => 'puppeteer',
      isDestroyed: () => state.destroyed,
      isExternallyBusy: () => state.busy,
    });
    return { reports, options, state };
  }

  it('retains listeners across report boundaries and captures independent exports', async () => {
    const { reports, options } = createManager();
    const listener = rs.fn();
    const remove = reports.addDumpUpdateListener(listener);
    reports.appendExecutionDump(execution('first'));
    reports.notifyDumpUpdateListeners();
    const first = listener.mock.calls[0][0];
    const firstName = reports.reportFileName;
    options.groupName = 'second group';
    await reports.resetDump();
    expect(reports.reportFileName).not.toBe(firstName);
    reports.appendExecutionDump(execution('second'));
    reports.notifyDumpUpdateListeners();
    expect(
      JSON.parse(first).executions.map((item: { id: string }) => item.id),
    ).toEqual(['first']);
    expect(JSON.parse(listener.mock.calls[1][0])).toMatchObject({
      groupName: 'second group',
      executions: [{ id: 'second' }],
    });
    remove();
    reports.notifyDumpUpdateListeners();
    expect(listener).toHaveBeenCalledTimes(2);
    await reports.finalizeReport();
    expect(reports.dump.executions).toEqual([]);
  });

  it('rejects external ownership and live operations without owning execution resources', async () => {
    const { reports, state } = createManager();
    state.busy = true;
    await expect(reports.resetDump()).rejects.toThrow('Agent is executing');
    await expect(reports.finalizeReport()).rejects.toThrow(
      'Agent is executing',
    );
    state.busy = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = reports.withReportOperation(() => gate);
    try {
      await expect(reports.resetDump()).rejects.toThrow('Agent is executing');
      await expect(reports.finalizeReport()).rejects.toThrow(
        'Agent is executing',
      );
    } finally {
      release();
    }
    await running;
    await reports.resetDump();
    state.destroyed = true;
    await expect(reports.withReportOperation(async () => {})).rejects.toThrow(
      'destroyed Agent',
    );
    await expect(reports.resetDump()).rejects.toThrow('destroyed Agent');
    // Destruction can still seal the last report.
    await expect(reports.finalizeReport()).resolves.toBeUndefined();
  });

  it('retains runner ownership across finalization and resets', async () => {
    const { reports } = createManager();
    const oldRunner = {} as TaskRunner;
    reports.bindRunner(oldRunner);
    expect(() => reports.assertRunnerCurrent(oldRunner)).not.toThrow();
    await reports.finalizeReport();
    expect(() => reports.assertRunnerCurrent(oldRunner)).toThrow(
      'late execution update',
    );
    await reports.resetDump();
    expect(() => reports.assertRunnerCurrent(oldRunner)).toThrow(
      'late execution update',
    );
    const nextRunner = {} as TaskRunner;
    reports.bindRunner(nextRunner);
    expect(() => reports.assertRunnerCurrent(nextRunner)).not.toThrow();
    await reports.finalizeReport();
  });
});
