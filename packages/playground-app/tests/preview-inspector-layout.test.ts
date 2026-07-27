/** @vitest-environment jsdom */
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { PreviewInspectorLayout } from '../src/PreviewInspectorLayout';

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('PreviewInspectorLayout', () => {
  it('keeps the preview mounted while the inspector opens and closes', async () => {
    let mounts = 0;
    let unmounts = 0;
    const Preview = () => {
      useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return createElement('div', { 'data-testid': 'preview' });
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = async (inspectorOpen: boolean) => {
      await act(async () => {
        root.render(
          createElement(PreviewInspectorLayout, {
            inspector: createElement('aside', null, 'Inspector'),
            inspectorOpen,
            preview: createElement(Preview),
          }),
        );
      });
    };

    await render(false);
    await render(true);
    await render(false);

    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
    expect(container.querySelector('[data-testid="preview"]')).not.toBeNull();
    expect(container.querySelector('aside')).toBeNull();

    await act(async () => root.unmount());
    expect(unmounts).toBe(1);
    container.remove();
  });
});
