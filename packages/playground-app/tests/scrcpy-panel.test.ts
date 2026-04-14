import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScrcpyPanel } from '../src/ScrcpyPanel';

describe('ScrcpyPanel', () => {
  it('renders the custom connecting overlay when provided', () => {
    const html = renderToStaticMarkup(
      createElement(ScrcpyPanel, {
        connectingOverlay: createElement(
          'div',
          { id: 'custom-connecting-overlay' },
          'overlay',
        ),
        serverUrl: 'http://127.0.0.1:9234',
      }),
    );

    expect(html).toContain('custom-connecting-overlay');
    expect(html).not.toContain('Connecting to scrcpy preview server');
  });
});
