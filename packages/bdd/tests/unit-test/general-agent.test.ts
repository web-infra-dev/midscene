/**
 * Pure-logic tests for the general agent: no model calls, no top-level
 * @midscene/core import (CallAiGeneralAgent lazy-imports it at run time).
 */
import { describe, expect, it } from 'vitest';
import {
  VERDICT_INSTRUCTIONS,
  buildGeneralPrompt,
  extractVerdict,
} from '../../src/agents/general-agent';
import { renderSkillsForPrompt } from '../../src/skills';
import type { GeneralAgentRequest, Skill } from '../../src/types';

const req = (over: Partial<GeneralAgentRequest>): GeneralAgentRequest => ({
  kind: 'act',
  prompt: 'do the thing',
  skills: [],
  ...over,
});

describe('extractVerdict', () => {
  it('finds a trailing verdict after prose', () => {
    const text = `I checked the logs and everything looks healthy.\n{"pass": true, "reason": "all 3 services responded 200"}`;
    expect(extractVerdict(text)).toEqual({
      pass: true,
      reason: 'all 3 services responded 200',
    });
  });

  it('survives nested evidence objects', () => {
    const text = `Verdict: {"pass": false, "reason": "missing field", "evidence": {"expected": {"a": 1}, "actual": {}}}`;
    expect(extractVerdict(text)).toEqual({
      pass: false,
      reason: 'missing field',
    });
  });

  it('survives braces inside JSON strings', () => {
    const text = `{"pass": true, "reason": "payload was {\\"ok\\": true} as expected }{"}`;
    expect(extractVerdict(text)).toEqual({
      pass: true,
      reason: 'payload was {"ok": true} as expected }{',
    });
  });

  it('picks the last valid candidate when several exist', () => {
    const text = [
      'First I thought {"pass": true, "reason": "early guess"}',
      'but after re-checking:',
      '{"pass": false, "reason": "the table is empty"}',
    ].join('\n');
    expect(extractVerdict(text)).toEqual({
      pass: false,
      reason: 'the table is empty',
    });
  });

  it('rejects candidates whose pass is not a boolean', () => {
    const text = `{"pass": "true", "reason": "stringly typed"} then {"pass": true}`;
    expect(extractVerdict(text)).toEqual({
      pass: true,
      reason: '(no reason given)',
    });
  });

  it('falls back to an earlier candidate when the last one is invalid', () => {
    const text = `{"pass": false, "reason": "real verdict"}\ntrailing {"pass": "nope"}`;
    expect(extractVerdict(text)).toEqual({
      pass: false,
      reason: 'real verdict',
    });
  });

  it('returns undefined when no verdict exists', () => {
    expect(extractVerdict('all good, nothing to report')).toBeUndefined();
    expect(extractVerdict('object without pass: {"ok": true}')).toBeUndefined();
    expect(extractVerdict('')).toBeUndefined();
  });

  it('ignores quotes in surrounding prose', () => {
    const text = `He said "this should "pass"" and then {"pass": true, "reason": "fine"}`;
    expect(extractVerdict(text)).toEqual({ pass: true, reason: 'fine' });
  });
});

describe('buildGeneralPrompt', () => {
  it('appends VERDICT_INSTRUCTIONS for assert requests', () => {
    const prompt = buildGeneralPrompt(req({ kind: 'assert' }));
    expect(prompt.startsWith('do the thing')).toBe(true);
    expect(prompt).toContain(VERDICT_INSTRUCTIONS);
  });

  it('does not append VERDICT_INSTRUCTIONS for act requests', () => {
    const prompt = buildGeneralPrompt(req({ kind: 'act' }));
    expect(prompt).not.toContain(VERDICT_INSTRUCTIONS);
  });

  it('includes the rendered skills section when skills are present', () => {
    const skills: Skill[] = [
      { name: 'check-logs', content: 'Look at the logs.', file: '/s.md' },
    ];
    const prompt = buildGeneralPrompt(req({ skills }));
    expect(prompt).toContain(renderSkillsForPrompt(skills));
    expect(prompt).toContain('check-logs');
  });

  it('omits the skills section when skills are empty', () => {
    const prompt = buildGeneralPrompt(req({}));
    expect(prompt).toBe('do the thing');
  });
});

describe('VERDICT_INSTRUCTIONS', () => {
  it('mentions the fail-closed pass:false behavior', () => {
    expect(VERDICT_INSTRUCTIONS).toContain('fail-closed');
    expect(VERDICT_INSTRUCTIONS).toContain('"pass": false');
  });
});
