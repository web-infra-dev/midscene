import { describe, expect, test } from 'vitest';
import { getPromptInputActionLabel } from '../src/utils/action-label';

describe('getPromptInputActionLabel', () => {
  test('prefers the selected action label over the fallback label', () => {
    expect(getPromptInputActionLabel('aiAct', 'Action')).toBe('Act');
    expect(getPromptInputActionLabel('aiTap', 'Action')).toBe('Tap');
  });

  test('falls back to the provided label when there is no selected type', () => {
    expect(getPromptInputActionLabel('', 'Action')).toBe('Action');
  });

  test('uses Action as the final fallback', () => {
    expect(getPromptInputActionLabel('')).toBe('Action');
  });
});
