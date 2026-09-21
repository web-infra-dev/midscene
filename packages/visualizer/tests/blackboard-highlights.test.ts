import type { UIContext } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Blackboard } from '../src/component/blackboard';
import { normalizeBlackboardHighlights } from '../src/component/blackboard/highlights';

describe('blackboard highlights', () => {
  it('accepts point-only locate results', () => {
    const highlights = normalizeBlackboardHighlights([
      {
        description: '礼包',
        center: [698, 1950],
      },
    ]);

    expect(highlights).toEqual([
      {
        key: expect.any(String),
        label: '礼包',
        center: [698, 1950],
      },
    ]);
  });

  it('deduplicates repeated highlight elements', () => {
    const highlights = normalizeBlackboardHighlights([
      {
        description: '礼包',
        center: [698, 1950],
      },
      {
        description: '礼包',
        center: [698, 1950],
      },
    ]);

    expect(highlights).toHaveLength(1);
  });

  it('renders rect overlays without point markers or labels in blackboard markup', () => {
    const html = renderToStaticMarkup(
      createElement(Blackboard, {
        uiContext: {
          shotSize: { width: 1080, height: 2400 },
          screenshot:
            'data:image/png;base64,mock' as unknown as UIContext['screenshot'],
          shrunkShotToLogicalRatio: 1,
        },
        highlightElements: [
          {
            id: 'gift',
            attributes: { nodeType: 1 as any },
            content: '礼包',
            center: [698, 1950],
            isVisible: true,
          },
        ] as any,
      }),
    );

    expect(html).toContain('blackboard-rect blackboard-rect-highlight');
    expect(html).not.toContain('blackboard-point');
    expect(html).not.toContain('class="blackboard-rect-label">礼包</span>');
    expect(html).toContain(
      'class="blackboard-main-content" style="width:fit-content;max-width:100%;position:relative"',
    );
  });
});
