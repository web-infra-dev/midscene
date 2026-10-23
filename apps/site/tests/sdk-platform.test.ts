import { describe, expect, it } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SdkPlatformContent,
  SdkPlatformProvider,
  SdkPlatformSelector,
} from '../theme/components/SdkPlatform';

describe('SDK platform documentation', () => {
  it('renders matching installation and example sections on the first load', () => {
    const html = renderToStaticMarkup(
      createElement(SdkPlatformProvider, null, [
        createElement(SdkPlatformSelector, { key: 'selector', lang: 'en' }),
        ...(['install', 'example'] as const).flatMap((section) =>
          (['android', 'ios', 'harmonyos', 'desktop'] as const).map(
            (platform) =>
              createElement(
                SdkPlatformContent,
                {
                  key: `${section}-${platform}`,
                  platform,
                },
                `${section}-${platform}`,
              ),
          ),
        ),
      ]),
    );
    expect(html).toContain('install-android');
    expect(html).toContain('example-android');
    for (const platform of ['ios', 'harmonyos', 'desktop']) {
      expect(html).not.toContain(`install-${platform}`);
      expect(html).not.toContain(`example-${platform}`);
    }
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('provides Chinese labels', () => {
    const html = renderToStaticMarkup(
      createElement(
        SdkPlatformProvider,
        null,
        createElement(SdkPlatformSelector, { lang: 'zh' }),
      ),
    );
    expect(html).toContain('选择接入平台');
    expect(html).toContain('桌面端');
  });

  it('reports content placed outside its provider', () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(
          SdkPlatformContent,
          {
            platform: 'android',
          },
          'example',
        ),
      ),
    ).toThrow('SDK platform components must be inside SdkPlatformProvider');
  });
});
