// Real on-disk fixture for agent.test.ts — covers the named `IOSDevice` export
// branch of agentFromWebDriverAgent's override resolution. See agent.test.ts for
// why a real fixture (observed via a global counter) is used instead of a mock.
export class IOSDevice {
  async connect() {
    globalThis.__iosOverrideConnectFromOption =
      (globalThis.__iosOverrideConnectFromOption ?? 0) + 1;
  }

  actionSpace() {
    return [];
  }

  setAppNameMapping() {}
}
