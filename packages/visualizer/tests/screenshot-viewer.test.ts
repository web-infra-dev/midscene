import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ScreenshotViewer from '../src/component/screenshot-viewer';

describe('ScreenshotViewer', () => {
  it('renders a screen-only variant without viewer chrome', () => {
    const html = renderToStaticMarkup(
      createElement(ScreenshotViewer, {
        getScreenshot: async () => null,
        serverOnline: true,
        mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
        mode: 'screen-only',
      }),
    );

    expect(html).toContain('screenshot-viewer screen-only');
    expect(html).toContain('screenshot-content');
    expect(html).not.toContain('screenshot-header');
    expect(html).not.toContain('device-name-overlay');
  });

  it('keeps the default viewer chrome when no mode override is provided', () => {
    const html = renderToStaticMarkup(
      createElement(ScreenshotViewer, {
        getScreenshot: async () => null,
        serverOnline: true,
        mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
      }),
    );

    expect(html).toContain('screenshot-header');
    expect(html).toContain('device-name-overlay');
  });
});
