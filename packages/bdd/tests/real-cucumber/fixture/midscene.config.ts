/**
 * Real-cucumber fixture config — loaded by jiti INSIDE the spawned cucumber
 * process. Unlike the in-process integration fixture (which records into
 * globalThis), this stub records CROSS-PROCESS: every call appends one JSON
 * line to the file named by process.env.BDD_STUB_LOG, which the vitest side
 * parses after the child process exits.
 *
 * Imports only '@midscene/bdd' (Node package self-reference — the fixture
 * lives inside packages/bdd, so the specifier resolves through the package's
 * own exports map to dist) plus node builtins, so the file loads in any
 * process that can resolve the built package.
 */
import { appendFileSync } from 'node:fs';
import { defineBddConfig } from '@midscene/bdd';
import type { UiAgent } from '@midscene/bdd';

function record(entry: unknown[]): void {
  const file = process.env.BDD_STUB_LOG;
  if (!file) {
    throw new Error(
      'BDD_STUB_LOG is not set — the real-cucumber test must provide it',
    );
  }
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

const stubAgent: UiAgent = {
  async aiAct(prompt: string): Promise<unknown> {
    record(['aiAct', prompt]);
    return undefined;
  },
  async aiAssert(
    assertion: string,
    _errorMsg?: string,
    opt?: { keepRawResponse?: boolean },
  ): Promise<unknown> {
    record(['aiAssert', assertion, opt ?? null]);
    if (opt?.keepRawResponse) {
      if (assertion.includes('SOFT_FAIL')) {
        return { pass: false, thought: 'soft thought' };
      }
      return { pass: true };
    }
    if (assertion.includes('FAIL_ME')) {
      throw new Error(`stub assertion failed: ${assertion}`);
    }
    return undefined;
  },
  async aiString(prompt: string): Promise<string> {
    record(['aiString', prompt]);
    return prompt.includes('EMPTY') ? '' : '42.00';
  },
  reportFile: '/tmp/bdd-fake-report.html',
};

export default defineBddConfig({
  uiAgent: async () => ({
    agent: stubAgent,
    cleanup: async () => record(['cleanup']),
  }),
});
