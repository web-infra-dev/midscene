/**
 * ESM-fixture config — loaded by jiti inside the spawned cucumber process.
 * Same cross-process recording contract as ../fixture/midscene.config.ts:
 * every call appends one JSON line to the file named by BDD_STUB_LOG.
 *
 * '@midscene/bdd' resolves through the node_modules symlink the test
 * harness creates (fixture-esm/node_modules/@midscene/bdd -> packages/bdd),
 * exactly like an installed dependency in a real ESM user project.
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
  async aiAssert(assertion: string): Promise<unknown> {
    record(['aiAssert', assertion]);
    return undefined;
  },
};

export default defineBddConfig({
  uiAgent: async () => ({
    agent: stubAgent,
    cleanup: async () => record(['cleanup']),
  }),
});
