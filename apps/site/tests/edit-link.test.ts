import { describe, expect, it, rs } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const location = rs.hoisted(() => ({ pathname: '/' }));
rs.mock('@rspress/core/runtime', () => ({
  useLocation: () => location,
}));
rs.mock('@rspress/core/theme-original', () => ({
  EditLink: ({ isOutline }: { isOutline?: boolean }) =>
    createElement('a', { href: '/edit', 'data-outline': isOutline }, 'Edit'),
}));

import { EditLink } from '../theme/components/EditLink';
import {
  allPaths,
  getStartedRoute,
} from '../theme/components/get-started-plan';

describe('edit links', () => {
  it('hides edit links in both placements for every generated setup page', () => {
    for (const lang of ['en', 'zh'] as const) {
      for (const path of allPaths) {
        location.pathname = getStartedRoute(lang, path);
        for (const isOutline of [false, true]) {
          expect(
            renderToStaticMarkup(createElement(EditLink, { isOutline })),
          ).toBe('');
        }
      }
    }
  });

  it('preserves edit links and placement for source-backed pages', () => {
    for (const pathname of ['/get-started', '/zh/get-started', '/api']) {
      location.pathname = pathname;
      expect(
        renderToStaticMarkup(createElement(EditLink, { isOutline: true })),
      ).toContain('data-outline="true"');
    }
  });
});
