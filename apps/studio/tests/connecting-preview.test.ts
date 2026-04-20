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
});
