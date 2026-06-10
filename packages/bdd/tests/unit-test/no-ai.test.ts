import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Given,
  Then,
  When,
  clearUserSteps,
  defineStep,
  listUserSteps,
  matchUserStep,
  noAiSnippet,
  noAiUnmatchedError,
} from '../../src/no-ai';

describe('no-ai user step registry', () => {
  beforeEach(() => {
    clearUserSteps();
  });

  describe('registration', () => {
    it('registers via all four aliases into one keyword-agnostic registry', () => {
      const fn = vi.fn();
      Given('a given step', fn);
      When('a when step', fn);
      Then('a then step', fn);
      defineStep('a generic step', fn);

      const defs = listUserSteps();
      expect(defs).toHaveLength(4);
      expect(defs.map((d) => d.pattern)).toEqual([
        'a given step',
        'a when step',
        'a then step',
        'a generic step',
      ]);

      // Keyword is documentation only: a Given-registered pattern matches
      // regardless of which keyword the feature file uses.
      expect(matchUserStep('a given step')?.def.fn).toBe(fn);
      expect(matchUserStep('a then step')?.def.fn).toBe(fn);
    });

    it('throws on duplicate identical pattern registration', () => {
      Given('I click the button', vi.fn());
      expect(() => When('I click the button', vi.fn())).toThrow(
        '[midscene-bdd] Step definition already registered for pattern: I click the button',
      );
    });

    it('throws on duplicate identical RegExp pattern registration', () => {
      Given(/^I wait (\d+)s$/, vi.fn());
      expect(() => defineStep(/^I wait (\d+)s$/, vi.fn())).toThrow(
        '[midscene-bdd] Step definition already registered for pattern:',
      );
    });
  });

  describe('matchUserStep', () => {
    it('matches cucumber expressions and extracts {string}/{int} args as strings', () => {
      const fn = vi.fn();
      When('I type {string} {int} times', fn);

      const match = matchUserStep('I type "hello" 3 times');
      expect(match).toBeDefined();
      expect(match?.def.fn).toBe(fn);
      expect(match?.args).toEqual(['hello', '3']);
    });

    it('falls back to literal exact-match when a string is not a valid expression', () => {
      const fn = vi.fn();
      // Unbalanced brace would crash CucumberExpression compilation.
      expect(() => Given('cost is {', fn)).not.toThrow();

      expect(matchUserStep('cost is {')).toEqual({
        def: { pattern: 'cost is {', fn },
        args: [],
      });
      expect(matchUserStep('cost is')).toBeUndefined();
    });

    it('matches RegExp patterns and extracts capture groups', () => {
      const fn = vi.fn();
      Then(/^the total is (\d+)\.(\d+)$/, fn);

      const match = matchUserStep('the total is 12.50');
      expect(match?.def.fn).toBe(fn);
      expect(match?.args).toEqual(['12', '50']);
    });

    it('maps undefined optional regex groups to empty strings', () => {
      Given(/^I order (\d+)( apples)?$/, vi.fn());
      expect(matchUserStep('I order 2')?.args).toEqual(['2', '']);
      expect(matchUserStep('I order 2 apples')?.args).toEqual(['2', ' apples']);
    });

    it('does not carry lastIndex state across matches for global regexes', () => {
      Given(/I see "(.+)"/g, vi.fn());
      expect(matchUserStep('I see "a"')?.args).toEqual(['a']);
      expect(matchUserStep('I see "a"')?.args).toEqual(['a']);
    });

    it('throws an ambiguity error listing all matching patterns', () => {
      Given('I open the page', vi.fn());
      When(/^I open the (page)$/, vi.fn());

      expect(() => matchUserStep('I open the page')).toThrow(
        '[midscene-bdd] Multiple step definitions match "I open the page": I open the page, /^I open the (page)$/',
      );
    });

    it('returns undefined when nothing matches', () => {
      Given('something else', vi.fn());
      expect(matchUserStep('no such step')).toBeUndefined();
    });
  });

  describe('noAiSnippet', () => {
    it('produces an exact classic snippet with {string} substitution and arg names', () => {
      expect(noAiSnippet('I login as "admin" with "secret"')).toBe(
        [
          "defineStep('I login as {string} with {string}', async function (arg1, arg2) {",
          '  // `this` is the step context (vars, getUiAgent, attach, log);',
          '  // throw to fail the step',
          '});',
        ].join('\n'),
      );
    });

    it('produces a no-arg snippet when the text has no quoted values', () => {
      expect(noAiSnippet('I reload the page')).toBe(
        [
          "defineStep('I reload the page', async function () {",
          '  // `this` is the step context (vars, getUiAgent, attach, log);',
          '  // throw to fail the step',
          '});',
        ].join('\n'),
      );
    });

    it('escapes single quotes in the suggested expression', () => {
      expect(noAiSnippet("I open the user's profile")).toBe(
        [
          "defineStep('I open the user\\'s profile', async function () {",
          '  // `this` is the step context (vars, getUiAgent, attach, log);',
          '  // throw to fail the step',
          '});',
        ].join('\n'),
      );
    });
  });

  describe('noAiUnmatchedError', () => {
    it('contains the step text and the ready-to-paste snippet', () => {
      const error = noAiUnmatchedError('I click "Save"');
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(
        '[midscene-bdd] Step is marked @no-ai but no step definition matched:\n' +
          '  I click "Save"\n' +
          'Implement it:\n\n' +
          "defineStep('I click {string}', async function (arg1) {\n" +
          '  // `this` is the step context (vars, getUiAgent, attach, log);\n' +
          '  // throw to fail the step\n' +
          '});',
      );
    });
  });

  describe('clearUserSteps', () => {
    it('resets the registry', () => {
      Given('a step', vi.fn());
      expect(listUserSteps()).toHaveLength(1);
      clearUserSteps();
      expect(listUserSteps()).toHaveLength(0);
      expect(matchUserStep('a step')).toBeUndefined();
    });
  });
});
