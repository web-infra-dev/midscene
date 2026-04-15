import { describe, expect, test } from 'vitest';
import { getPromptInputActionLabel } from '../src/utils/action-label';

describe('getPromptInputActionLabel', () => {
  test('override label wins over the auto-derived type label', () => {
    expect(getPromptInputActionLabel('aiAct', 'Action')).toBe('Action');
    expect(getPromptInputActionLabel('aiTap', 'Send')).toBe('Send');
  });

  test('derives the label from the selected type when no override is given', () => {
    expect(getPromptInputActionLabel('aiAct')).toBe('Act');
    expect(getPromptInputActionLabel('aiTap')).toBe('Tap');
  });

  test('falls back to Action when neither an override nor a usable type exists', () => {
    expect(getPromptInputActionLabel('')).toBe('Action');
  });
});
