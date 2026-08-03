import { describe, expect, it } from 'vitest';
import { uiautomatorXmlToUiNode } from '../../src/ui-tree';

describe('uiautomatorXmlToUiNode', () => {
  it('unwraps a hierarchy and converts physical bounds to logical bounds', () => {
    const root = uiautomatorXmlToUiNode(
      `<?xml version="1.0"?>
<hierarchy rotation="0">
  <node class="android.widget.FrameLayout" package="com.example" bounds="[0,0][400,800]">
    <node class="android.widget.Button" resource-id="submit" text="Pay &amp; continue" bounds="[20,40][180,100]"/>
  </node>
</hierarchy>`,
      2,
    );

    expect(root).toMatchObject({
      type: 'android.widget.FrameLayout',
      attrs: { package: 'com.example' },
      bounds: { left: 0, top: 0, width: 200, height: 400 },
      children: [
        {
          type: 'android.widget.Button',
          attrs: {
            'resource-id': 'submit',
            text: 'Pay & continue',
          },
          bounds: { left: 10, top: 20, width: 80, height: 30 },
        },
      ],
    });
    expect(root.attrs.bounds).toBeUndefined();
  });

  it('retains a synthetic hierarchy root for multi-window dumps', () => {
    const root = uiautomatorXmlToUiNode(
      `<hierarchy>
        <node class="WindowA" bounds="[0,0][100,100]"/>
        <node class="WindowB" bounds="[100,0][200,100]"/>
      </hierarchy>`,
      1,
    );

    expect(root.type).toBe('hierarchy');
    expect(root.children.map((child) => child.type)).toEqual([
      'WindowA',
      'WindowB',
    ]);
  });

  it('throws for malformed XML', () => {
    expect(() =>
      uiautomatorXmlToUiNode('<hierarchy><node></hierarchy>', 1),
    ).toThrow('unbalanced close tag');
  });
});
