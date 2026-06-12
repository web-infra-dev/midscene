import {
  AstBuilder,
  GherkinClassicTokenMatcher,
  Parser,
  compile,
} from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { GherkinDocument, Pickle, PickleStep } from '@cucumber/messages';
import { describe, expect, it } from 'vitest';
import {
  collectAnnotationFootguns,
  parseSkillTokens,
  resolveStepAnnotations,
  stepTypeOf,
} from '../../src/annotations';

function parse(source: string): {
  document: GherkinDocument;
  pickles: Pickle[];
} {
  const newId = IdGenerator.uuid();
  const parser = new Parser(
    new AstBuilder(newId),
    new GherkinClassicTokenMatcher(),
  );
  const document = parser.parse(source);
  return {
    document,
    pickles: [...compile(document, 'inline.feature', newId)],
  };
}

function stepOf(pickle: Pickle, text: string): PickleStep {
  const step = pickle.steps.find((s) => s.text === text);
  if (!step) {
    throw new Error(`no pickle step with text "${text}"`);
  }
  return step;
}

function resolve(
  parsed: { document: GherkinDocument; pickles: Pickle[] },
  stepText: string,
  pickleIndex = 0,
) {
  const pickle = parsed.pickles[pickleIndex];
  return resolveStepAnnotations({
    document: parsed.document,
    pickle,
    pickleStep: stepOf(pickle, stepText),
  });
}

describe('parseSkillTokens', () => {
  it('extracts tokens, deduped, order preserved', () => {
    expect(
      parseSkillTokens('use $check-logs then $db_reset then $check-logs'),
    ).toEqual(['check-logs', 'db_reset']);
  });

  it('requires a letter as the first character', () => {
    // Digit-first tokens are excluded so money amounts in step text
    // ("the total is $42.50") can never hijack routing to the agent.
    expect(parseSkillTokens('$-nope $_nope $9lives')).toEqual([]);
    expect(parseSkillTokens('the cart total is $42.50')).toEqual([]);
    expect(parseSkillTokens('run $check-logs for $42')).toEqual(['check-logs']);
  });

  it('stops tokens at invalid characters', () => {
    expect(parseSkillTokens('$a.b and $c!')).toEqual(['a', 'c']);
  });

  it('returns empty for text without tokens', () => {
    expect(parseSkillTokens('no tokens here')).toEqual([]);
  });
});

describe('stepTypeOf', () => {
  const source = `Feature: f
  Scenario: s
    Given a precondition
    When an action
    Then an outcome
    And another outcome
    But not that outcome
    * a starred step
`;

  it('maps Given/When/Then keywords', () => {
    const { pickles } = parse(source);
    expect(stepTypeOf(stepOf(pickles[0], 'a precondition'))).toBe('context');
    expect(stepTypeOf(stepOf(pickles[0], 'an action'))).toBe('action');
    expect(stepTypeOf(stepOf(pickles[0], 'an outcome'))).toBe('outcome');
  });

  it('And/But inherit the prior keyword type', () => {
    const { pickles } = parse(source);
    expect(stepTypeOf(stepOf(pickles[0], 'another outcome'))).toBe('outcome');
    expect(stepTypeOf(stepOf(pickles[0], 'not that outcome'))).toBe('outcome');
  });

  it('returns unknown when gherkin cannot type the step', () => {
    expect(stepTypeOf({ type: undefined } as PickleStep)).toBe('unknown');
  });
});

describe('resolveStepAnnotations', () => {
  it('reads markers from the comment block directly above the step', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # [agent]
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: true,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('does not leak a comment above the Scenario header into step 1', () => {
    const parsed = parse(`Feature: f
  # [agent] [soft] $sneaky
  Scenario: s
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('parses multiple markers on a single comment line', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # [agent] [soft] $skill-a
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: true,
      noAi: false,
      soft: true,
      skills: ['skill-a'],
    });
  });

  it('collects a contiguous multi-line comment block (marker-only lines)', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # [no-ai]
    # [soft]
    # $first $second
    When I do a thing
    Then nothing leaked here
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: true,
      noAi: true,
      soft: true,
      skills: ['first', 'second'],
    });
    expect(resolve(parsed, 'nothing leaked here')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('ignores prose comments that merely mention markers or tokens', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # TODO: convert this to @no-ai once the API client lands
    When I add the first item to the cart
    # costs about $5 per run, see $billing docs
    Then the run completes
`);
    expect(resolve(parsed, 'I add the first item to the cart')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
    expect(resolve(parsed, 'the run completes')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('drops the annotation when a blank line separates it from the step', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # [no-ai]

    When I do a thing
`);
    // Contiguity is the rule: a blank line breaks the block. Pinned so this
    // sharp edge is a documented choice rather than an accident.
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('stops the block at a non-comment line in between', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # [no-ai]
    Given an earlier step
    # [soft]
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: false,
      noAi: false,
      soft: true,
      skills: [],
    });
  });

  it('resolves annotations on Background steps', () => {
    const parsed = parse(`Feature: f
  Background:
    # [agent]
    Given a setup step
  Scenario: s
    When an action step
`);
    expect(resolve(parsed, 'a setup step')).toEqual({
      agent: true,
      noAi: false,
      soft: false,
      skills: [],
    });
    expect(resolve(parsed, 'an action step')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('resolves annotations inside Rule scenarios and rule backgrounds', () => {
    const parsed = parse(`Feature: f
  Rule: r
    Background:
      # [no-ai]
      Given a rule setup
    Scenario: s
      # [soft]
      When a rule action
`);
    expect(resolve(parsed, 'a rule setup')).toEqual({
      agent: false,
      noAi: true,
      soft: false,
      skills: [],
    });
    expect(resolve(parsed, 'a rule action')).toEqual({
      agent: false,
      noAi: false,
      soft: true,
      skills: [],
    });
  });

  it('shares outline step annotations across all example expansions', () => {
    const parsed = parse(`Feature: f
  Scenario Outline: s
    # [agent]
    When I use <x>

    Examples:
      | x |
      | 1 |
      | 2 |
`);
    expect(parsed.pickles).toHaveLength(2);
    expect(resolve(parsed, 'I use 1', 0)).toEqual({
      agent: true,
      noAi: false,
      soft: false,
      skills: [],
    });
    expect(resolve(parsed, 'I use 2', 1)).toEqual({
      agent: true,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('inherits @no-ai and @soft from feature and scenario tags', () => {
    const parsed = parse(`@no-ai
Feature: f
  @soft
  Scenario: s
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: false,
      noAi: true,
      soft: true,
      skills: [],
    });
  });

  it('ignores @agent and @flow as scenario tags', () => {
    const parsed = parse(`Feature: f
  @agent @flow
  Scenario: s
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('treats inline $tokens as agent and collects them', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    When I run $check-logs and $check-logs again
`);
    expect(resolve(parsed, 'I run $check-logs and $check-logs again')).toEqual({
      agent: true,
      noAi: false,
      soft: false,
      skills: ['check-logs'],
    });
  });

  it('ignores $tokens injected via Scenario Outline example values', () => {
    // The pickle text is post-substitution; routing must come from the
    // AUTHORED step text, so an Examples cell can never flip a row to the
    // general agent.
    const parsed = parse(`Feature: f
  Scenario Outline: s
    When I pay via <method>

    Examples:
      | method  |
      | $sneaky |
`);
    expect(resolve(parsed, 'I pay via $sneaky')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('keeps authored $tokens routing inside a Scenario Outline step', () => {
    const parsed = parse(`Feature: f
  Scenario Outline: s
    Then the <kind> log is clean, per $check-logs

    Examples:
      | kind   |
      | server |
`);
    expect(resolve(parsed, 'the server log is clean, per $check-logs')).toEqual(
      {
        agent: true,
        noAi: false,
        soft: false,
        skills: ['check-logs'],
      },
    );
  });

  it('merges comment and inline skills, comment-first, deduped', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # $alpha
    When I run $beta with $alpha
`);
    expect(resolve(parsed, 'I run $beta with $alpha')).toEqual({
      agent: true,
      noAi: false,
      soft: false,
      skills: ['alpha', 'beta'],
    });
  });

  it('does not match marker prefixes of longer words', () => {
    const parsed = parse(`Feature: f
  Scenario: s
    # [agents] [softer] [no-aim]
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });

  it('does not route the retired @-marker syntax', () => {
    // Clean break: `# @agent` was the pre-release syntax and is now plain
    // prose for the resolver (the footgun audit warns about it separately).
    const parsed = parse(`Feature: f
  Scenario: s
    # @agent @no-ai @soft
    When I do a thing
`);
    expect(resolve(parsed, 'I do a thing')).toEqual({
      agent: false,
      noAi: false,
      soft: false,
      skills: [],
    });
  });
});

describe('collectAnnotationFootguns', () => {
  function structuredFootguns(source: string, uri = 'probe.feature') {
    const { document } = parse(source);
    document.uri = uri;
    return collectAnnotationFootguns(document);
  }

  /** Message-only view; most cases assert on the human-readable warning. */
  function footguns(source: string, uri = 'probe.feature'): string[] {
    return structuredFootguns(source, uri).map((footgun) => footgun.message);
  }

  it('returns structured kinds and lines, not just prose', () => {
    const found = structuredFootguns(`@agent
Feature: f
  Scenario: s
    # [agent]

    # @no-ai
    # [soft] but with prose
    When I do a thing
`);
    expect(found.map(({ kind, line }) => ({ kind, line }))).toEqual([
      { kind: 'detached', line: 4 },
      { kind: 'legacy', line: 6 },
      { kind: 'marker-prose', line: 7 },
      { kind: 'tag-level-agent', line: 1 },
    ]);
  });

  it('warns on a marker comment detached from its step by a blank line', () => {
    const warnings = footguns(`Feature: f
  Scenario: s
    # [agent]

    When I do a thing
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"# [agent]"');
    expect(warnings[0]).toContain('probe.feature:3');
    expect(warnings[0]).toContain('not directly above a step');
  });

  it('warns on a marker comment block stranded above a Scenario header', () => {
    const warnings = footguns(`Feature: f
  # [no-ai] $probe
  Scenario: s
    When I do a thing
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"# [no-ai] $probe"');
    expect(warnings[0]).toContain('probe.feature:2');
  });

  it('warns once per detached marker line, none for the attached block', () => {
    const warnings = footguns(`Feature: f
  Scenario: s
    # [soft]
    # [agent]

    Given an earlier step
    # [no-ai]
    # $probe
    When I do a thing
`);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('probe.feature:3');
    expect(warnings[1]).toContain('probe.feature:4');
  });

  it('warns on @agent used as a feature, scenario, or examples tag', () => {
    const warnings = footguns(`@agent
Feature: f
  @agent
  Scenario Outline: s
    When I use <x>

    @agent
    Examples:
      | x |
      | 1 |
`);
    expect(warnings).toHaveLength(3);
    for (const warning of warnings) {
      expect(warning).toContain('tag "@agent"');
      expect(warning).toContain('is ignored');
    }
    expect(warnings[0]).toContain('probe.feature:1');
  });

  it('warns on @agent tags inside a Rule', () => {
    const warnings = footguns(`Feature: f
  @agent
  Rule: r
    Scenario: s
      When I do a thing
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('probe.feature:2');
  });

  it('warns on a comment that starts with a marker but mixes in prose', () => {
    const warnings = footguns(`Feature: f
  Scenario: s
    # [agent] check the logs
    When I do a thing
    # $check-logs after deploying
    Then it worked
`);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('"# [agent] check the logs"');
    expect(warnings[0]).toContain('probe.feature:3');
    expect(warnings[0]).toContain('starts with a routing marker');
    expect(warnings[1]).toContain('"# $check-logs after deploying"');
    expect(warnings[1]).toContain('probe.feature:5');
  });

  it('does not flag prose that merely mentions a marker mid-line', () => {
    const warnings = footguns(`Feature: f
  Scenario: s
    # TODO: make this [no-ai] later
    When I do a thing
    # @agents is not a marker, and neither is [agents]
    Then it worked
`);
    expect(warnings).toEqual([]);
  });

  it('warns on marker-only comments in the retired @-syntax', () => {
    const warnings = footguns(`Feature: f
  Scenario: s
    # @agent
    When I do a thing
    # @no-ai @soft
    Then it worked
    # @agent $check-logs
    Then the logs are clean
`);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('"# @agent"');
    expect(warnings[0]).toContain('probe.feature:3');
    expect(warnings[0]).toContain('retired @-marker syntax');
    expect(warnings[0]).toContain('# [agent]');
    expect(warnings[1]).toContain('"# @no-ai @soft"');
    expect(warnings[1]).toContain('probe.feature:5');
    expect(warnings[2]).toContain('"# @agent $check-logs"');
    expect(warnings[2]).toContain('probe.feature:7');
  });

  it('warns the legacy way even when the @-marker comment is detached', () => {
    // The legacy warning wins over the detached-annotation warning: the
    // line would not route even if it were attached, so the migration hint
    // is the actionable message.
    const warnings = footguns(`Feature: f
  Scenario: s
    # @agent

    When I do a thing
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('retired @-marker syntax');
  });

  it('flags legacy markers at line start, ignores mid-line mentions', () => {
    // `# @agent check the logs` routed before the syntax change, so it gets
    // the migration hint (same start-of-line rule as the bracket prose
    // footgun). Prose that mentions the old syntax mid-line stays silent.
    const warnings = footguns(`Feature: f
  Scenario: s
    # @agent check the logs
    When I do a thing
    # we used to write @no-ai here
    Then it worked
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"# @agent check the logs"');
    expect(warnings[0]).toContain('retired @-marker syntax');
  });

  it('stays silent for attached markers, prose comments, and consumed tags', () => {
    const warnings = footguns(`@no-ai
Feature: f
  # this prose comment mentions @agent but is not marker-only
  @soft @flow @param:x @must-fail
  Scenario: s
    # [agent]
    When I do a thing
`);
    expect(warnings).toEqual([]);
  });
});
