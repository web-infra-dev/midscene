import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/flow-ir';
import { compileSuite } from '../../src/frontends/gherkin';
import { FakeGeneralAgent, FakeUiAgent } from './helpers/fake-agents';

const LOGIN_FLOW = `Feature: Shared flows
  @flow @param:role @returns:greeting
  Scenario: Login
    When I sign in as the "{role}" user
    When I remember the greeting shown in the header as "greeting"
`;

const GREET_MODULE = `Feature: Greeting
  Scenario: Greet
    When I run the "Login" flow with role "admin"
    Then the header shows {greeting}
`;

function writeSuite(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mts-suite-'));
  for (const [rel, source] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, source);
  }
  return dir;
}

describe('compileSuite: multi-file assembly', () => {
  it('globs .feature files recursively in deterministic (sorted) order', () => {
    const dir = writeSuite({
      'features/greet.feature': GREET_MODULE,
      'flows/login.feature': LOGIN_FLOW,
      'notes.md': 'not a feature file',
    });
    const suite = compileSuite(dir);
    expect(suite.modules.map((m) => m.file)).toEqual([
      join(dir, 'features/greet.feature'),
      join(dir, 'flows/login.feature'),
    ]);
  });

  it('resolves a flow defined in another file via the merged registry', async () => {
    const suite = compileSuite(
      writeSuite({
        'features/greet.feature': GREET_MODULE,
        'flows/login.feature': LOGIN_FLOW,
      }),
    );
    const greet = suite.modules[0].feature.scenarios[0];

    const ui = new FakeUiAgent(['Hello, Admin!']);
    const general = new FakeGeneralAgent();
    const result = await runScenario({
      scenario: greet,
      registry: suite.registry,
      uiAgent: ui,
      generalAgent: general,
    });

    expect(result.status).toBe('passed');
    expect(ui.actCalls).toEqual(['I sign in as the "admin" user']);
    expect(general.calls[0].instruction).toBe('the header shows Hello, Admin!');
  });

  it('accepts an explicit file list instead of a directory', () => {
    const dir = writeSuite({
      'flows/login.feature': LOGIN_FLOW,
      'features/greet.feature': GREET_MODULE,
    });
    const suite = compileSuite([
      join(dir, 'flows/login.feature'),
      join(dir, 'features/greet.feature'),
    ]);
    // Explicit lists keep the caller's order.
    expect(suite.modules[0].file).toBe(join(dir, 'flows/login.feature'));
    expect(suite.registry.has('Login')).toBe(true);
  });

  it('rejects duplicate flow names across files, naming both files', () => {
    const dir = writeSuite({
      'flows/login.feature': LOGIN_FLOW,
      'flows/login-copy.feature': LOGIN_FLOW,
    });
    let error: Error | undefined;
    try {
      compileSuite(dir);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toMatch(/flow "Login" is defined in both/);
    expect(error?.message).toContain(join(dir, 'flows/login-copy.feature'));
    expect(error?.message).toContain(join(dir, 'flows/login.feature'));
  });

  it('throws when no .feature files are found', () => {
    const dir = writeSuite({ 'readme.md': 'empty suite' });
    expect(() => compileSuite(dir)).toThrow(/no \.feature files found/);
    expect(() => compileSuite([])).toThrow(/no \.feature files found/);
  });
});
