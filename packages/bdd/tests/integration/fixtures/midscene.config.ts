/**
 * Integration-test BDD config: uses the `uiAgent` FACTORY escape hatch to
 * inject a stub UI agent (no browser, no model). The stub records every call
 * into a globalThis array so the test file (which shares the process) can
 * assert exact call sequences.
 *
 * Canned behavior:
 * - aiAct: records ['act', prompt].
 * - aiAssert: records ['assert', prompt]; with keepRawResponse it returns
 *   { pass: false, thought: 'soft-fail' } when the prompt contains
 *   SOFT_FAIL (else { pass: true }); without keepRawResponse it throws when
 *   the prompt contains FAIL_ME, else resolves (pass).
 * - aiString: records ['string', prompt]; '' for EMPTY prompts, '42.00' for
 *   price-ish prompts, a fixed greeting otherwise.
 */
import { defineBddConfig } from '../../../src/config';
import type { UiAgent } from '../../../src/types';

export interface UiStubRecord {
  calls: Array<[method: 'act' | 'assert' | 'string', prompt: string]>;
  factoryCalls: number;
}

/** Must match UI_STUB_KEY in run-cucumber.test.ts. */
const UI_STUB_KEY = '__midscene_bdd_integration_ui_stub__';

function record(): UiStubRecord {
  const g = globalThis as Record<string, unknown>;
  if (!g[UI_STUB_KEY]) {
    g[UI_STUB_KEY] = { calls: [], factoryCalls: 0 } satisfies UiStubRecord;
  }
  return g[UI_STUB_KEY] as UiStubRecord;
}

const stubUiAgent: UiAgent = {
  async aiAct(prompt: string): Promise<void> {
    record().calls.push(['act', prompt]);
  },
  async aiAssert(
    assertion: string,
    _errorMsg?: string,
    opt?: { keepRawResponse?: boolean },
  ): Promise<unknown> {
    record().calls.push(['assert', assertion]);
    if (opt?.keepRawResponse) {
      if (assertion.includes('SOFT_FAIL')) {
        return { pass: false, thought: 'soft-fail' };
      }
      return { pass: true };
    }
    if (assertion.includes('FAIL_ME')) {
      throw new Error(`stub assertion failed: ${assertion}`);
    }
    return undefined;
  },
  async aiString(prompt: string): Promise<string> {
    record().calls.push(['string', prompt]);
    if (prompt.includes('EMPTY')) return '';
    if (/price/i.test(prompt)) return '42.00';
    return 'hello-from-stub';
  },
};

export default defineBddConfig({
  uiAgent: async () => {
    record().factoryCalls += 1;
    return { agent: stubUiAgent };
  },
  paths: {
    features: ['features/**/*.feature'],
    skills: 'skills',
  },
});
