import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ConnectingPreview from '../src/renderer/components/ConnectingPreview';

describe('ConnectingPreview', () => {
  it('renders the local phone and pc icons with the connecting label', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectingPreview, {
        pcSrc: 'pc.svg',
        phoneSrc: 'phone.svg',
      }),
    );

    expect(html).toContain('pc.svg');
    expect(html).toContain('phone.svg');
    expect(html).toContain('Preparing device connection...');
  });

  it('renders a custom status label when one is provided', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectingPreview, {
        pcSrc: 'pc.svg',
        phoneSrc: 'phone.svg',
        statusLabel: 'Waiting for first video frame…',
      }),
    );

    expect(html).toContain('Waiting for first video frame…');
  });
});
