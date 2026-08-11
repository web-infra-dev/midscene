// Real on-disk fixture for agent.test.ts — covers the *default* export branch of
// agentFromWebDriverAgent's override resolution (the option fixture covers the
// named `IOSDevice` export). See agent.test.ts for the rationale.
export default class {
  async connect() {
    globalThis.__iosOverrideConnectFromEnv =
      (globalThis.__iosOverrideConnectFromEnv ?? 0) + 1;
  }

  actionSpace() {
    return [];
  }

  setAppNameMapping() {}
}
