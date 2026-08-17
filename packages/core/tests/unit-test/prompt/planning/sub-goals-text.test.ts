import { buildSubGoalsText } from '@/ai-model/prompt/planning';
import { describe, expect, it } from 'vitest';

describe('buildSubGoalsText', () => {
  it('returns an empty string when no sub-goals are provided', () => {
    expect(buildSubGoalsText([])).toBe('');
  });

  it('renders all sub-goals and the running sub-goal progress', () => {
    expect(
      buildSubGoalsText([
        {
          index: 1,
          status: 'finished',
          description: 'Fill the Name field',
        },
        {
          index: 2,
          status: 'running',
          description: 'Fill the Email field',
          logs: ['Click the Email field', 'Type the email address'],
        },
        {
          index: 3,
          status: 'pending',
          description: 'Return the email address',
        },
      ]),
    ).toBe(`Sub-goals:
1. Fill the Name field (finished)
2. Fill the Email field (running)
3. Return the email address (pending)
Current sub-goal is: Fill the Email field
Actions performed for current sub-goal:
- Click the Email field
- Type the email address`);
  });

  it('uses the first pending sub-goal when none is running', () => {
    expect(
      buildSubGoalsText([
        {
          index: 1,
          status: 'finished',
          description: 'Open the form',
        },
        {
          index: 2,
          status: 'pending',
          description: 'Submit the form',
        },
      ]),
    ).toBe(`Sub-goals:
1. Open the form (finished)
2. Submit the form (pending)
Current sub-goal is: Submit the form`);
  });
});
