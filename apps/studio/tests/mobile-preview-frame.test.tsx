import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MobilePreviewFrame } from '../src/renderer/components/MainContent/MobilePreviewFrame';

describe('MobilePreviewFrame', () => {
  it('offsets the mobile viewport without masking device corners', () => {
    const html = renderToStaticMarkup(
      createElement(
        MobilePreviewFrame,
        { enabled: true },
        createElement('div', null, 'preview'),
      ),
    );

    expect(html).toContain('translate-y-[-26px]');
    expect(html).not.toContain('rounded-[34px]');
  });

  it('does not offset the unframed preview surface', () => {
    const html = renderToStaticMarkup(
      createElement(
        MobilePreviewFrame,
        { enabled: false },
        createElement('div', null, 'preview'),
      ),
    );

    expect(html).not.toContain('translate-y-[-26px]');
  });
});
