/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, rs } from '@rstest/core';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Logo } from '../src/component/logo';

rs.stubGlobal('React', React);

describe('Logo', () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('uses the supplied light and dark images when the theme changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(Logo, {
          lightSrc: 'data:image/png;base64,light',
          darkSrc: 'data:image/png;base64,dark',
        }),
      );
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,light',
    );

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,dark',
    );

    await act(async () => root.unmount());
    container.remove();
  });
});
