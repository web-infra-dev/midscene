import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ConnectionFailedPreview from '../src/renderer/components/ConnectionFailedPreview';
import DisconnectedPreview from '../src/renderer/components/DisconnectedPreview';

describe('connection state previews', () => {
  it('renders the disconnected preview with the local icon and english copy', () => {
    const html = renderToStaticMarkup(
      createElement(DisconnectedPreview, {
        iconSrc: 'connection-closed.svg',
      }),
    );

    expect(html).toContain('connection-closed.svg');
    expect(html).toContain('Connect Android Device');
  });

  it('renders the failed preview with the local icon and english copy', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionFailedPreview, {
        adbId: '61029ADBY537482',
        iconSrc: 'connection-failed.svg',
      }),
    );

    expect(html).toContain('connection-failed.svg');
    expect(html).toContain('Connection failed');
    expect(html).toContain('ADB Device: 61029ADBY537482');
    expect(html).toContain('Reconnect');
  });
});
