import { describe, expect, it } from '@rstest/core';
import {
  shouldRenderCustomEmptyState,
  shouldShowTimelineActions,
} from '../src/component/universal-playground/empty-state';
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

describe('UniversalPlayground empty state actions', () => {
  it('hides timeline actions on a custom homepage', () => {
    expect(
      shouldRenderCustomEmptyState(
        [createMessage({ id: 'welcome' })],
        'Welcome to Midscene.js Playground!',
      ),
    ).toBe(true);
    expect(shouldShowTimelineActions(true)).toBe(false);
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
      shouldRenderCustomEmptyState([createMessage({ id: 'welcome' })]),
    ).toBe(false);
  });

  it('keeps timeline actions available after execution content is shown', () => {
    expect(shouldShowTimelineActions(false)).toBe(true);
  });
});
