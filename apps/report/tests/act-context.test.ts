import { describe, expect, it } from 'vitest';
import { buildDisplayedActContext } from '../src/components/detail-side/act-context';

describe('buildDisplayedActContext', () => {
  it('appends extra planning context after aiActContext', () => {
    expect(
      buildDisplayedActContext(
        'base prompt',
        '\n<PageElementsTree>\n<SeekBar text="Display brightness" />\n</PageElementsTree>',
      ),
    ).toContain('Display brightness');
  });

  it('returns extra planning context when aiActContext is missing', () => {
    expect(buildDisplayedActContext(undefined, '<PageElementsTree />')).toBe(
      '<PageElementsTree />',
    );
  });

  it('does not duplicate extra planning context when already included', () => {
    const context = 'base prompt\n<PageElementsTree />';

    expect(buildDisplayedActContext(context, '<PageElementsTree />')).toBe(
      context,
    );
  });
});
