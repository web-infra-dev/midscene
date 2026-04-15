import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  IncutImportedMainArea,
  IncutImportedSidebar,
  IncutPlaygroundShell,
} from '../src/renderer/components/IncutPlaygroundImport';

describe('IncutPlaygroundImport', () => {
  it('renders the imported sidebar structure from the zip bundle', () => {
    const html = renderToStaticMarkup(createElement(IncutImportedSidebar));

    expect(html).toContain('设备总览');
    expect(html).toContain('Platform');
    expect(html).toContain('HarmonyOS');
    expect(html).toContain('设置');
  });

  it('renders the imported main area playground mock', () => {
    const html = renderToStaticMarkup(createElement(IncutImportedMainArea));

    expect(html).toContain('Playground');
    expect(html).toContain('Disconnect');
    expect(html).toContain('点赞 midscene github');
    expect(html).toContain('执行流程');
  });

  it('renders the reusable playground shell header and child content', () => {
    const html = renderToStaticMarkup(
      createElement(
        IncutPlaygroundShell,
        { title: 'Playground' },
        createElement('div', null, 'child-body'),
      ),
    );

    expect(html).toContain('Playground');
    expect(html).toContain('child-body');
  });
});
