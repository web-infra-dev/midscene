import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildExploreModel, renderDashboard } from '../../src/explore';
import type { ExploreModel } from '../../src/explore';
import type { ResolvedBddConfig } from '../../src/types';

const tmpDirs: string[] = [];

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeFixture(files: Record<string, string>): ResolvedBddConfig {
  const baseDir = mkdtempSync(join(tmpdir(), 'midscene-bdd-explore-'));
  tmpDirs.push(baseDir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(baseDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
  return {
    uiAgent: { type: 'web', url: 'http://localhost' },
    generalAgent: {},
    paths: { features: ['features/**/*.feature'], skills: 'features/skills' },
    baseDir,
  };
}

const FLOWS_FEATURE = `Feature: Shared flows

  @flow @param:role
  Scenario: I am logged in as {string}
    When I open the login page
    Then the "<role>" dashboard is visible

  @flow @param:product
  Scenario: I have added {string} to the cart
    Given I am logged in as "buyer"
    When I add the "<product>" item to the cart
`;

const CART_FEATURE = `@cart
Feature: Cart
  Inspect the cart contents.

  @smoke
  Scenario: Total reflects the added item
    Given I have added "Mug" to the cart
    When I open the cart page
    Then the total equals the <price> placeholder text

  Scenario Outline: The "<role>" role can log in
    Given I am logged in as "<role>"

    Examples:
      | role  |
      | admin |
      | guest |
`;

function basicConfig(): ResolvedBddConfig {
  return makeFixture({
    'features/flows/login.feature': FLOWS_FEATURE,
    'features/cart.feature': CART_FEATURE,
  });
}

describe('buildExploreModel', () => {
  it('models features, scenarios, steps and keywords', async () => {
    const model = await buildExploreModel(basicConfig());

    expect(model.baseDir).toBeTruthy();
    expect(model.features.map((f) => f.relPath)).toEqual([
      'features/cart.feature',
      'features/flows/login.feature',
    ]);

    const cart = model.features[0];
    expect(cart.name).toBe('Cart');
    expect(cart.tags).toEqual(['@cart']);
    expect(cart.description).toBe('Inspect the cart contents.');
    expect(cart.scenarios).toHaveLength(2);

    // The flows feature contains only @flow scenarios — they are modeled in
    // model.flows, not as feature scenarios.
    expect(model.features[1].scenarios).toEqual([]);

    const total = cart.scenarios[0];
    expect(total.id).toBe('scenario:features/cart.feature#6');
    expect(total.tags).toEqual(['@smoke']);
    expect(total.isOutline).toBe(false);
    expect(total.steps.map((s) => s.keyword)).toEqual([
      'Given ',
      'When ',
      'Then ',
    ]);
    expect(total.steps.map((s) => s.stepType)).toEqual([
      'context',
      'action',
      'outcome',
    ]);
    expect(total.steps[0].line).toBe(7);

    // 4 scenario steps (3 + 1) + 4 flow steps (2 + 2); 3 flow calls.
    expect(model.stats).toEqual({
      features: 2,
      scenarios: 2,
      flows: 2,
      steps: 8,
      edges: 3,
      agentSteps: 0,
      noAiSteps: 0,
    });
  });

  it('classifies step routing with router precedence (no-ai > agent > ui)', async () => {
    const config = makeFixture({
      'features/skills/check-logs.md': '# check-logs\n\nInspect logs.\n',
      'features/routing.feature': `Feature: Routing

  Scenario: Mixed routing
    Given I open the page
    # [agent]
    When the coding agent rotates the API key
    Then the server log notes the rotation, per $check-logs
    # [no-ai]
    Then the counter increments
    # [soft]
    Then the banner is visible
    # [no-ai] [agent]
    Then conflicting markers prefer the callback
`,
    });
    const model = await buildExploreModel(config);
    const steps = model.features[0].scenarios[0].steps;

    // Default → Midscene UI agent.
    expect(steps[0].route).toBe('ui');
    expect(steps[0].annotations.soft).toBe(false);
    // # [agent] comment → general coding agent.
    expect(steps[1].route).toBe('agent');
    expect(steps[1].annotations.skills).toEqual([]);
    // Inline $skill token implies agent and carries the skill name.
    expect(steps[2].route).toBe('agent');
    expect(steps[2].annotations.skills).toEqual(['check-logs']);
    // # [no-ai] → user-registered classic callback.
    expect(steps[3].route).toBe('no-ai');
    // # [soft] is captured but does not change the route.
    expect(steps[4].route).toBe('ui');
    expect(steps[4].annotations.soft).toBe(true);
    // no-ai beats agent, exactly like the runtime router.
    expect(steps[5].route).toBe('no-ai');
    expect(steps[5].annotations.agent).toBe(true);

    expect(model.stats.agentSteps).toBe(2);
    expect(model.stats.noAiSteps).toBe(2);
  });

  it('never flow-matches annotated steps, mirroring router precedence', async () => {
    const config = makeFixture({
      'features/flows/login.feature': `Feature: Flows

  @flow @param:role
  Scenario: I am logged in as {string}
    When I open the login page

  @flow
  Scenario: I do {string} thing
    When I wave

  @flow
  Scenario: I do "special" thing
    When I wave
`,
      'features/main.feature': `Feature: Main

  Scenario: Annotated steps skip the flow registry
    # [agent]
    Given I am logged in as "admin"
    # [no-ai]
    And I am logged in as "guest"
    # the next step would be an ambiguous flow match if it were unannotated
    # [agent]
    When I do "special" thing
    # ...and this one an unknown-flow-sugar error
    # [no-ai]
    And I run the "nope" flow
`,
    });
    const model = await buildExploreModel(config);
    const main = model.features.find(
      (feature) => feature.relPath === 'features/main.feature',
    );
    const steps = main?.scenarios[0].steps ?? [];

    // The runtime router rules out flows for @agent/@no-ai steps, so the
    // model must produce no flow calls and no edges for them...
    expect(steps.map((s) => s.route)).toEqual([
      'agent',
      'no-ai',
      'agent',
      'no-ai',
    ]);
    for (const step of steps) {
      expect(step.flowCall).toBeUndefined();
    }
    expect(model.edges).toEqual([]);

    // ...no error-grade findings from matchStep throwing on text the
    // runtime would never hand to the registry...
    expect(
      model.health.filter(
        (h) =>
          h.kind === 'ambiguous-flow-match' || h.kind === 'unknown-flow-sugar',
      ),
    ).toEqual([]);

    // ...and every flow stays unused (nothing actually calls them).
    expect(model.flows.every((flow) => flow.callers.length === 0)).toBe(true);
    expect(model.health.filter((h) => h.kind === 'unused-flow')).toHaveLength(
      3,
    );
  });

  it('extracts flow edges, including flow-to-flow, with args and callers', async () => {
    const model = await buildExploreModel(basicConfig());

    expect(model.flows.map((f) => f.name)).toEqual([
      'I am logged in as {string}',
      'I have added {string} to the cart',
    ]);
    const [login, addToCart] = model.flows;
    expect(login.params).toEqual(['role']);
    expect(login.uri).toBe('features/flows/login.feature');
    expect(login.line).toBe(4);

    // Scenario -> flow edge with captured args.
    const scenarioEdge = model.edges.find(
      (e) => e.from === 'scenario:features/cart.feature#6',
    );
    expect(scenarioEdge).toEqual({
      from: 'scenario:features/cart.feature#6',
      to: 'flow:I have added {string} to the cart',
      stepIndex: 0,
      args: { product: 'Mug' },
    });
    expect(model.features[0].scenarios[0].steps[0].flowCall).toEqual({
      flowId: 'flow:I have added {string} to the cart',
      args: { product: 'Mug' },
    });

    // Flow -> flow edge (add-to-cart calls login internally).
    const flowEdge = model.edges.find((e) => e.from === addToCart.id);
    expect(flowEdge).toEqual({
      from: 'flow:I have added {string} to the cart',
      to: 'flow:I am logged in as {string}',
      stepIndex: 0,
      args: { role: 'buyer' },
    });

    expect(login.callers).toEqual([
      'flow:I have added {string} to the cart',
      'scenario:features/cart.feature#11',
    ]);
    expect(addToCart.callers).toEqual(['scenario:features/cart.feature#6']);
  });

  it('models <param> placeholders in flow bodies only, flagging undeclared ones', async () => {
    const model = await buildExploreModel(basicConfig());

    // Declared @param: placeholders in flow-body steps are bound.
    const [login, addToCart] = model.flows;
    expect(login.steps[1].paramUses).toEqual(['role']);
    expect(login.steps[1].paramIssues).toBeUndefined();
    expect(addToCart.steps[1].paramUses).toEqual(['product']);

    // Scenario steps have no placeholder semantics: <price> in plain step
    // text is just text — no chips, no findings.
    const [total] = model.features[0].scenarios;
    expect(total.steps[2].text).toContain('<price>');
    expect(total.steps[2].paramUses).toBeUndefined();
    expect(total.steps[2].paramIssues).toBeUndefined();
    expect(model.health.filter((h) => h.kind === 'undeclared-param')).toEqual(
      [],
    );
  });

  it('flags undeclared <placeholder> tokens inside flow bodies', async () => {
    const config = makeFixture({
      'features/flows/widget.feature': `Feature: Widget flows

  @flow @param:dial
  Scenario: I configure the {string} widget
    When I tweak the <dial> setting
    Then the <ghost> indicator settles
`,
    });
    const model = await buildExploreModel(config);
    const [widget] = model.flows;
    expect(widget.steps[0].paramUses).toEqual(['dial']);
    expect(widget.steps[1].paramIssues).toEqual(['ghost']);
    expect(model.health.filter((h) => h.kind === 'undeclared-param')).toEqual([
      expect.objectContaining({
        kind: 'undeclared-param',
        subject: 'ghost',
        uri: 'features/flows/widget.feature',
        line: 6,
      }),
    ]);
    const finding = model.health.find((h) => h.kind === 'undeclared-param');
    expect(finding?.message).toContain('not a declared @param:');
    expect(finding?.message).toContain('params: dial');
  });

  it('models a Scenario Outline as one entry with exampleCount', async () => {
    const model = await buildExploreModel(basicConfig());
    const outline = model.features[0].scenarios[1];

    expect(outline.isOutline).toBe(true);
    expect(outline.exampleCount).toBe(2);
    expect(outline.name).toBe('The "<role>" role can log in');
    // Steps come from the FIRST pickle expansion (Examples row 1): gherkin
    // substitutes outline <placeholders> before pickles exist, so the model
    // never sees them as placeholders.
    expect(outline.steps[0].text).toBe('I am logged in as "admin"');
    expect(outline.steps[0].paramUses).toBeUndefined();
    // ... but keyword and line come from the AST step.
    expect(outline.steps[0].keyword).toBe('Given ');
    expect(outline.steps[0].line).toBe(12);
    expect(outline.steps[0].flowCall?.args).toEqual({ role: 'admin' });
  });

  it('reports every health kind', async () => {
    const config = makeFixture({
      'features/flows/chain.feature': `Feature: Chains

  @flow
  Scenario: the alpha chain is prepared
    Given the beta chain is prepared

  @flow
  Scenario: the beta chain is prepared
    Given the gamma chain is prepared

  @flow
  Scenario: the gamma chain is prepared
    When I wave

  @flow @param:x
  Scenario: I do {string} thing
    When I wave

  @flow
  Scenario: I do "special" thing
    When I wave

  @flow
  Scenario: nobody calls this flow
    When the <ghost> dial settles
`,
      'features/main.feature': `@agent
Feature: Main

  Scenario: Triggers findings
    When I do "special" thing
    And I run the "nope" flow
    # [agent]

    Then the detached marker above is ignored
    # [agent]
    And the audit log is appended, per $ghost-skill
    # @agent
    And the retired @-marker above is flagged as legacy
`,
    });
    const model = await buildExploreModel(config);
    const kinds = (kind: string) => model.health.filter((h) => h.kind === kind);

    expect(kinds('ambiguous-flow-match')).toHaveLength(1);
    expect(kinds('ambiguous-flow-match')[0]).toMatchObject({
      uri: 'features/main.feature',
      line: 5,
      subject: 'I do "special" thing',
    });

    expect(kinds('unknown-flow-sugar')).toHaveLength(1);
    expect(kinds('unknown-flow-sugar')[0].message).toContain(
      'Unknown flow "nope"',
    );

    expect(kinds('undeclared-param')).toEqual([
      expect.objectContaining({
        subject: 'ghost',
        uri: 'features/flows/chain.feature',
        line: 25,
      }),
    ]);

    // The "# [agent]" comment separated from its step by a blank line never
    // attaches — surfaced with the file:line of the dangling comment.
    expect(kinds('detached-annotation')).toEqual([
      expect.objectContaining({ uri: 'features/main.feature', line: 7 }),
    ]);
    expect(kinds('detached-annotation')[0].message).toContain(
      'features/main.feature:7',
    );

    // A feature/scenario-level @agent tag is silently ignored by routing.
    expect(kinds('tag-level-agent')).toEqual([
      expect.objectContaining({ uri: 'features/main.feature', line: 1 }),
    ]);

    // The retired "# @agent" syntax no longer routes — surfaced as its own
    // health kind with the migration hint.
    expect(kinds('legacy-annotation')).toEqual([
      expect.objectContaining({ uri: 'features/main.feature', line: 12 }),
    ]);
    expect(kinds('legacy-annotation')[0].message).toContain(
      'retired @-marker syntax',
    );

    expect(kinds('missing-skill')).toEqual([
      expect.objectContaining({ subject: 'ghost-skill', line: 11 }),
    ]);

    // alpha -> beta -> gamma nests 3 deep (> MAX_FLOW_DEPTH of 2); only the
    // chain head exceeds the cap.
    expect(kinds('flow-depth')).toEqual([
      expect.objectContaining({ subject: 'the alpha chain is prepared' }),
    ]);

    expect(kinds('unused-flow').map((h) => h.subject)).toContain(
      'nobody calls this flow',
    );
  });

  it('flags flows with zero incoming edges as unused', async () => {
    const config = makeFixture({
      'features/flows/f.feature': `Feature: F

  @flow
  Scenario: the helper is ready
    When I wave
`,
      'features/main.feature': `Feature: Main

  Scenario: Does not call the flow
    When I look around
`,
    });
    const model = await buildExploreModel(config);
    expect(model.health).toEqual([
      expect.objectContaining({
        kind: 'unused-flow',
        subject: 'the helper is ready',
        uri: 'features/flows/f.feature',
        line: 4,
      }),
    ]);
    expect(model.flows[0].callers).toEqual([]);
  });

  it('is deterministic across builds (modulo generatedAt)', async () => {
    const config = basicConfig();
    const strip = (model: ExploreModel) => {
      const { generatedAt: _generatedAt, ...rest } = model;
      return rest;
    };
    const a = await buildExploreModel(config);
    const b = await buildExploreModel(config);
    expect(strip(a)).toEqual(strip(b));
  });
});

describe('renderDashboard', () => {
  function withTemplatePathEnv<T>(value: string, run: () => T): T {
    const previous = process.env.MIDSCENE_BDD_DASHBOARD_TEMPLATE_PATH;
    process.env.MIDSCENE_BDD_DASHBOARD_TEMPLATE_PATH = value;
    try {
      return run();
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(
          process.env,
          'MIDSCENE_BDD_DASHBOARD_TEMPLATE_PATH',
        );
      } else {
        process.env.MIDSCENE_BDD_DASHBOARD_TEMPLATE_PATH = previous;
      }
    }
  }

  function withDashboardTemplate<T>(template: string, run: () => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'midscene-bdd-template-'));
    tmpDirs.push(dir);
    const templatePath = join(dir, 'dashboard-template.html');
    writeFileSync(templatePath, template, 'utf-8');
    return withTemplatePathEnv(templatePath, run);
  }

  it('renders one self-contained HTML document with safely embedded data', async () => {
    const model = await buildExploreModel(basicConfig());
    const html = withDashboardTemplate(
      '<!DOCTYPE html><html><head><title>midscene-bdd dashboard</title></head><body><script id="midscene-bdd-explore-model" type="application/json">__EXPLORE_MODEL_PLACEHOLDER__</script></body></html>',
      () => renderDashboard(model),
    );

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>midscene-bdd dashboard</title>');
    expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1);

    // Embedded model JSON with every '<' escaped (so no '</script>' or
    // comment-opener can terminate the data block).
    const tag =
      '<script id="midscene-bdd-explore-model" type="application/json">';
    expect(html).toContain(tag);
    const start = html.indexOf(tag) + tag.length;
    const end = html.indexOf('</script>', start);
    const json = html.slice(start, end);
    expect(json).toContain('\\u003c');
    expect(json).not.toContain('</');
    expect(JSON.parse(json)).toEqual(model);
  });

  it('throws a specific error when the override path does not exist', async () => {
    const model = await buildExploreModel(basicConfig());
    const missing = join(tmpdir(), 'missing-dashboard-template.html');
    withTemplatePathEnv(missing, () => {
      expect(() => renderDashboard(model)).toThrow(
        'MIDSCENE_BDD_DASHBOARD_TEMPLATE_PATH points to a missing file',
      );
    });
  });

  it('rejects a template whose JSON script tag lost the placeholder', async () => {
    const model = await buildExploreModel(basicConfig());
    // Placeholder present only as a quoted string in the JS bundle — the
    // anchored `>...</script>` form is what injection requires.
    expect(() =>
      withDashboardTemplate(
        '<html><body><script>var p = "__EXPLORE_MODEL_PLACEHOLDER__";</script></body></html>',
        () => renderDashboard(model),
      ),
    ).toThrow('placeholder inside its JSON script tag');
  });
});
