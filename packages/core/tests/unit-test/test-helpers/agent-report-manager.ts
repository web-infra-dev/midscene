import type { Agent } from '@/agent';
import { AgentReportManager } from '@/agent/agent-report-manager';
import { hasPendingResourceOperation } from '@/test-runner/engine/resource-operations';
import { hasActiveYamlExecution } from '@/yaml/execution-session';

/** Initialize report ownership for focused tests that construct only an Agent facade. */
export function installAgentReportManager(agent: Agent): void {
  Object.assign(agent, {
    reportManager: new AgentReportManager({
      getOptions: () => ({
        ...agent.opts,
        generateReport: false,
        persistExecutionDump: false,
      }),
      getDeviceType: () => agent.interface?.interfaceType ?? 'puppeteer',
      isDestroyed: () => agent.destroyed,
      isExternallyBusy: () =>
        Boolean((agent as any).activeObserver) ||
        hasActiveYamlExecution(agent) ||
        hasPendingResourceOperation(agent),
    }),
  });
}
