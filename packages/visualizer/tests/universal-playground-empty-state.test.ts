import { describe, expect, it } from 'vitest';
import { shouldRenderCustomEmptyState } from '../src/component/universal-playground/empty-state';
import type { InfoListItem } from '../src/types';

function createMessage(overrides: Partial<InfoListItem>): InfoListItem {
  return {
    id: 'welcome',
    type: 'system',
    content: '',
    timestamp: new Date('2026-05-06T00:00:00.000Z'),
    ...overrides,
  };
}

describe('shouldRenderCustomEmptyState', () => {
  it('renders host empty state for the welcome-only conversation', () => {
    expect(
      shouldRenderCustomEmptyState([createMessage({ id: 'welcome' })], 'empty'),
    ).toBe(true);
  });

  it('keeps the normal list once user-visible messages exist', () => {
    expect(
      shouldRenderCustomEmptyState(
        [
          createMessage({ id: 'welcome' }),
          createMessage({ id: 'user-1', type: 'user', content: 'tap login' }),
        ],
        'empty',
      ),
    ).toBe(false);
  });

  it('keeps the default welcome message when no host empty state is supplied', () => {
    expect(
      shouldRenderCustomEmptyState(
        [createMessage({ id: 'welcome' })],
        undefined,
      ),
    ).toBe(false);
  });
});
