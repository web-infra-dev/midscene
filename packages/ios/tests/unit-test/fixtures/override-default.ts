// Fixture loaded on disk because rstest 0.10.2 cannot create virtual modules
// via `rs.mock`. Exposes only a default export so the override loader exercises
// the `default` branch in `agentFromWebDriverAgent`.
interface IOSOverrideRegistry {
  connect?: () => Promise<void> | void;
  actionSpace?: () => unknown[];
  setAppNameMapping?: (...args: unknown[]) => void;
  connectCalls: number;
  actionSpaceCalls: number;
  setAppNameMappingCalls: number;
}

declare global {
  var __iosOverrideRegistry: IOSOverrideRegistry | undefined;
}

if (!globalThis.__iosOverrideRegistry) {
  globalThis.__iosOverrideRegistry = {
    connectCalls: 0,
    actionSpaceCalls: 0,
    setAppNameMappingCalls: 0,
  };
}
const r: IOSOverrideRegistry = globalThis.__iosOverrideRegistry;

export default class {
  async connect() {
    r.connectCalls += 1;
    return r.connect?.();
  }
  actionSpace() {
    r.actionSpaceCalls += 1;
    return r.actionSpace?.() ?? [];
  }
  setAppNameMapping(...args: unknown[]) {
    r.setAppNameMappingCalls += 1;
    return r.setAppNameMapping?.(...args);
  }
}
