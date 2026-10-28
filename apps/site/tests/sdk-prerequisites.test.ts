import { describe, expect, it } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SdkPrerequisites } from '../theme/components/SdkPrerequisites';

describe('SDK prerequisites', () => {
  for (const lang of ['en', 'zh'] as const) {
    for (const mode of ['playwright', 'vitest', 'standalone'] as const) {
      it(`renders ${lang} ${mode} requirements and localized links`, () => {
        const html = renderToStaticMarkup(
          createElement(SdkPrerequisites, { lang, mode }),
        );
        const prefix = lang === 'zh' ? '/zh' : '';
        expect(html.match(/<li>/g)).toHaveLength(4);
        expect(html).toContain(`href="${prefix}/model-api-setup"`);
        expect(html).toContain(
          `href="${prefix}/model-config#verify-model-connectivity"`,
        );
        expect(html).toContain('.env');
        if (mode === 'playwright') {
          expect(html).toContain('Playwright Test');
          expect(html).not.toContain('pnpm init');
          expect(html).not.toContain('/platforms/android');
        } else {
          expect(html).toContain('pnpm init');
          expect(html).toContain(`href="${prefix}/platforms/android"`);
        }
        expect(html.includes('Chrome Bridge')).toBe(mode === 'standalone');
      });
    }
  }
});
