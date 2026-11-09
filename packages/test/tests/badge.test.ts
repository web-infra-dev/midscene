import { describe, expect, it } from 'vitest';
import { renderTestBadge } from '../src/report/badge';

describe('renderTestBadge', () => {
  it('counts not-run cases in the badge fail total', () => {
    expect(renderTestBadge({ passed: 5, failed: 0, notRun: 3 })).toBe(
      '![Midscene Test: 5 passed, 3 failed](https://badge.midscenejs.com/e2e?pass=5&fail=3&style=large)',
    );
  });
});
