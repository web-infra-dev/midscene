import { describe, expect, it } from 'vitest';
import { extractVerdict } from '../../src/general-agent/codex-general-agent';

describe('extractVerdict', () => {
  it('parses a trailing verdict object after prose', () => {
    const verdict = extractVerdict(
      'The cart shows the right total.\n{"pass": true, "reason": "total matches"}',
    );
    expect(verdict).toEqual({
      pass: true,
      reason: 'total matches',
      evidence: undefined,
    });
  });

  it('parses verdicts with nested evidence objects', () => {
    const verdict = extractVerdict(
      'Analysis done.\n{"pass": false, "reason": "missing banner", "evidence": {"selector": "header", "seen": ["logo"]}}',
    );
    expect(verdict).toMatchObject({
      pass: false,
      reason: 'missing banner',
      evidence: { selector: 'header', seen: ['logo'] },
    });
  });

  it('prefers the last verdict and skips non-verdict JSON', () => {
    const verdict = extractVerdict(
      '{"note": "scratch"}\n{"pass": false, "reason": "first"}\nrevised:\n{"pass": true, "reason": "second"}',
    );
    expect(verdict).toMatchObject({ pass: true, reason: 'second' });
  });

  it('fails closed on replies without a parseable verdict', () => {
    expect(extractVerdict('all good, trust me')).toBeUndefined();
    expect(extractVerdict('{"pass": "yes"}')).toBeUndefined();
  });

  it('ignores braces inside JSON strings', () => {
    const verdict = extractVerdict(
      '{"pass": true, "reason": "shows {price} placeholder literally"}',
    );
    expect(verdict).toMatchObject({ pass: true });
  });
});
