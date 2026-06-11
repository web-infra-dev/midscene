import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { extractFlowDefs, parseFeature, scanAssets } from '../../src/assets';
import type { ResolvedBddConfig } from '../../src/types';

// The flows module is authored concurrently; only smoke-test scanAssets
// (which constructs a FlowRegistry) when it resolves.
const flowsAvailable = await import('../../src/flows').then(
  () => true,
  () => false,
);

const FLOW_FEATURE = `Feature: flows
  @flow @param:user @param:role
  Scenario: I am logged in as {string} with {string}
    When I log in
`;

function parsedFixture(source: string, uri: string) {
  const { document, pickles } = parseFeature(source, uri);
  return { document, pickles, uri };
}

describe('parseFeature', () => {
  it('parses a feature into a document and pickles', () => {
    const { document, pickles } = parseFeature(
      `Feature: f
  Scenario: one
    When I do a thing
  Scenario: two
    Then I see a thing
`,
      'ok.feature',
    );
    expect(document.feature?.name).toBe('f');
    expect(document.uri).toBe('ok.feature');
    expect(pickles).toHaveLength(2);
    expect(pickles.map((p) => p.name)).toEqual(['one', 'two']);
    expect(pickles[0].uri).toBe('ok.feature');
  });

  it('wraps parse errors with the midscene-bdd prefix and uri', () => {
    expect(() =>
      parseFeature('this is not gherkin at all', 'bad.feature'),
    ).toThrow(/^\[midscene-bdd\] Failed to parse bad\.feature: /);
  });
});

describe('extractFlowDefs', () => {
  it('extracts @flow pickles with params in tag order', () => {
    const defs = extractFlowDefs([parsedFixture(FLOW_FEATURE, 'a.feature')]);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('I am logged in as {string} with {string}');
    expect(defs[0].params).toEqual(['user', 'role']);
    expect(defs[0].uri).toBe('a.feature');
    expect(defs[0].pickle.name).toBe(defs[0].name);
    expect(defs[0].document.uri).toBe('a.feature');
  });

  it('ignores pickles without @flow and malformed param tags', () => {
    const defs = extractFlowDefs([
      parsedFixture(
        `Feature: flows
  @param:ignored
  Scenario: not a flow
    When I do a thing

  @flow @param:1bad @param:
  Scenario: a flow
    When I do a thing
`,
        'a.feature',
      ),
    ]);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('a flow');
    expect(defs[0].params).toEqual([]);
  });

  it('throws on duplicate flow names across files, naming both files', () => {
    expect(() =>
      extractFlowDefs([
        parsedFixture(FLOW_FEATURE, 'a.feature'),
        parsedFixture(FLOW_FEATURE, 'b.feature'),
      ]),
    ).toThrow(
      '[midscene-bdd] Duplicate flow "I am logged in as {string} with {string}" defined in a.feature and b.feature',
    );
  });

  it('throws on duplicate flow names within a single file', () => {
    const source = `Feature: flows
  @flow
  Scenario: do the thing
    When I do a thing

  @flow
  Scenario: do the thing
    When I do a thing
`;
    expect(() => extractFlowDefs([parsedFixture(source, 'a.feature')])).toThrow(
      '[midscene-bdd] Duplicate flow "do the thing" defined in a.feature and a.feature',
    );
  });
});

describe('scanAssets', () => {
  const tmpDirs: string[] = [];

  function makeFixtureDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'midscene-bdd-assets-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterAll(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function configFor(baseDir: string): ResolvedBddConfig {
    return {
      uiAgent: { type: 'web', url: 'http://localhost' },
      generalAgent: {},
      paths: { features: ['features/**/*.feature'], skills: 'features/skills' },
      baseDir,
    };
  }

  it.skipIf(!flowsAvailable)(
    'globs, parses and registers flows deterministically',
    async () => {
      const baseDir = makeFixtureDir();
      mkdirSync(join(baseDir, 'features', 'nested'), { recursive: true });
      writeFileSync(
        join(baseDir, 'features', 'nested', 'b.feature'),
        FLOW_FEATURE,
        'utf-8',
      );
      writeFileSync(
        join(baseDir, 'features', 'a.feature'),
        `Feature: plain
  Scenario: no flow here
    When I do a thing
`,
        'utf-8',
      );

      const assets = await scanAssets(configFor(baseDir));

      expect(assets.files).toEqual([
        join(baseDir, 'features', 'a.feature'),
        join(baseDir, 'features', 'nested', 'b.feature'),
      ]);
      // Assert via the contract-guaranteed list() only; matching internals
      // belong to the flows module's own tests.
      expect(assets.flows.list().map((flow) => flow.name)).toEqual([
        'I am logged in as {string} with {string}',
      ]);
    },
  );

  it.skipIf(!flowsAvailable)(
    'propagates duplicate flow errors with absolute file paths',
    async () => {
      const baseDir = makeFixtureDir();
      mkdirSync(join(baseDir, 'features'), { recursive: true });
      writeFileSync(
        join(baseDir, 'features', 'a.feature'),
        FLOW_FEATURE,
        'utf-8',
      );
      writeFileSync(
        join(baseDir, 'features', 'b.feature'),
        FLOW_FEATURE,
        'utf-8',
      );

      await expect(scanAssets(configFor(baseDir))).rejects.toThrow(
        `[midscene-bdd] Duplicate flow "I am logged in as {string} with {string}" defined in ${join(baseDir, 'features', 'a.feature')} and ${join(baseDir, 'features', 'b.feature')}`,
      );
    },
  );
});
