import { describe, expect, it } from 'vitest';
import {
  parseXmlToFormatTree,
  collapseWrappers,
  formatTreeToXml,
  type FormatNode,
} from '../../src/ui-hierarchy';

/** Helper to build a full UIAutomator node string */
function n(attrs: {
  text?: string;
  'resource-id'?: string;
  class?: string;
  'content-desc'?: string;
  clickable?: string;
  selected?: string;
  checked?: string;
  scrollable?: string;
  bounds?: string;
}, children?: string): string {
  const defaults: Record<string, string> = {
    index: '0', text: '', 'resource-id': '', class: 'android.view.View',
    package: 'com.example', 'content-desc': '', checkable: 'false',
    checked: 'false', clickable: 'false', enabled: 'true', focusable: 'false',
    focused: 'false', scrollable: 'false', 'long-clickable': 'false',
    password: 'false', selected: 'false', bounds: '[0,0][1080,1920]',
  };
  const merged = { ...defaults, ...attrs };
  const attrStr = Object.entries(merged).map(([k, v]) => `${k}="${v}"`).join(' ');
  if (children === undefined) {
    return `<node ${attrStr} />`;
  }
  return `<node ${attrStr}>${children}</node>`;
}

function wrap(inner: string): string {
  return `<hierarchy rotation="0">${inner}</hierarchy>`;
}

// =====================================================
// parseXmlToFormatTree
// =====================================================

describe('parseXmlToFormatTree', () => {
  it('should parse basic attributes', () => {
    const xml = wrap(n({
      text: 'Hello',
      'resource-id': 'com.example:id/title',
      class: 'android.widget.TextView',
      'content-desc': 'Greeting',
      clickable: 'true',
      selected: 'true',
      checked: 'true',
      scrollable: 'true',
    }));

    const root = parseXmlToFormatTree(xml);
    expect(root.children).toHaveLength(1);

    const node = root.children[0];
    expect(node.text).toBe('Hello');
    expect(node.resourceId).toBe('com.example:id/title');
    expect(node.className).toBe('TextView');
    expect(node.contentDesc).toBe('Greeting');
    expect(node.clickable).toBe(true);
    expect(node.selected).toBe(true);
    expect(node.checked).toBe(true);
    expect(node.scrollable).toBe(true);
  });

  it('should use short class name', () => {
    const xml = wrap(n({ text: 'X', class: 'android.widget.Button' }));
    const root = parseXmlToFormatTree(xml);
    expect(root.children[0].className).toBe('Button');
  });

  it('should build correct tree hierarchy', () => {
    const xml = wrap(
      n({ class: 'android.widget.FrameLayout', 'content-desc': 'root' },
        n({ text: 'A', class: 'android.widget.TextView' }) +
        n({ text: 'B', class: 'android.widget.TextView' })
      )
    );
    const root = parseXmlToFormatTree(xml);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].children).toHaveLength(2);
    expect(root.children[0].children[0].text).toBe('A');
    expect(root.children[0].children[1].text).toBe('B');
  });

  it('should filter self-closing leaves with no semantic info', () => {
    const xml = wrap(
      n({ class: 'android.widget.FrameLayout', 'content-desc': 'container' },
        // kept: has text
        n({ text: 'Visible', class: 'android.widget.TextView' }) +
        // filtered: no text, no content-desc, not clickable, not scrollable
        n({ class: 'android.view.View' }) +
        // kept: has content-desc
        n({ 'content-desc': 'icon', class: 'android.widget.ImageView' }) +
        // kept: clickable
        n({ clickable: 'true', class: 'android.widget.Button' }) +
        // kept: scrollable
        n({ scrollable: 'true', class: 'android.view.View' })
      )
    );
    const root = parseXmlToFormatTree(xml);
    expect(root.children[0].children).toHaveLength(4);
  });

  it('should return empty tree for empty XML', () => {
    const root = parseXmlToFormatTree('');
    expect(root.children).toHaveLength(0);
  });

  it('should return empty tree for XML with no nodes', () => {
    const root = parseXmlToFormatTree('<hierarchy rotation="0"></hierarchy>');
    expect(root.children).toHaveLength(0);
  });

  it('should handle self-closing tags correctly', () => {
    const xml = wrap(n({ text: 'Only', class: 'android.widget.TextView' }));
    const root = parseXmlToFormatTree(xml);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe('Only');
    expect(root.children[0].children).toHaveLength(0);
  });

  it('should default boolean attributes to false when not true', () => {
    const xml = wrap(n({ text: 'X', clickable: 'false', selected: 'false' }));
    const root = parseXmlToFormatTree(xml);
    const node = root.children[0];
    expect(node.clickable).toBe(false);
    expect(node.selected).toBe(false);
    expect(node.checked).toBe(false);
    expect(node.scrollable).toBe(false);
  });
});

// =====================================================
// collapseWrappers
// =====================================================

describe('collapseWrappers', () => {
  it('should collapse pure wrapper containers (no text, no desc, not interactive)', () => {
    // wrapper(no info) → child(text="Hello") → should become just child
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'FrameLayout', text: '', resourceId: '', contentDesc: '',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [{
          className: 'TextView', text: 'Hello', resourceId: '', contentDesc: '',
          clickable: false, selected: false, checked: false, scrollable: false,
          children: [],
        }],
      }],
    };

    collapseWrappers(root);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe('Hello');
    expect(root.children[0].className).toBe('TextView');
  });

  it('should keep containers with content-desc', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'FrameLayout', text: '', resourceId: '', contentDesc: 'Tab',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [{
          className: 'TextView', text: 'Label', resourceId: '', contentDesc: '',
          clickable: false, selected: false, checked: false, scrollable: false,
          children: [],
        }],
      }],
    };

    collapseWrappers(root);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].contentDesc).toBe('Tab');
    expect(root.children[0].children[0].text).toBe('Label');
  });

  it('should keep clickable containers', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'Button', text: '', resourceId: '', contentDesc: '',
        clickable: true, selected: false, checked: false, scrollable: false,
        children: [],
      }],
    };

    collapseWrappers(root);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].clickable).toBe(true);
  });

  it('should keep scrollable containers', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'RecyclerView', text: '', resourceId: '', contentDesc: '',
        clickable: false, selected: false, checked: false, scrollable: true,
        children: [],
      }],
    };

    collapseWrappers(root);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].scrollable).toBe(true);
  });

  it('should keep containers with resource-id that group ≥2 children', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'ViewGroup', text: '', resourceId: 'id/toolbar', contentDesc: '',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [
          { className: 'TextView', text: 'Title', resourceId: '', contentDesc: '',
            clickable: false, selected: false, checked: false, scrollable: false, children: [] },
          { className: 'ImageView', text: '', resourceId: '', contentDesc: 'Menu',
            clickable: false, selected: false, checked: false, scrollable: false, children: [] },
        ],
      }],
    };

    collapseWrappers(root);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].resourceId).toBe('id/toolbar');
    expect(root.children[0].children).toHaveLength(2);
  });

  it('should collapse containers with resource-id that have <2 children (pass-through)', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'FrameLayout', text: '', resourceId: 'id/wrapper', contentDesc: '',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [{
          className: 'TextView', text: 'Inner', resourceId: '', contentDesc: '',
          clickable: false, selected: false, checked: false, scrollable: false,
          children: [],
        }],
      }],
    };

    collapseWrappers(root);
    // wrapper collapsed, Inner promoted
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe('Inner');
  });

  it('should collapse multiple layers of wrappers', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'FrameLayout', text: '', resourceId: '', contentDesc: '',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [{
          className: 'LinearLayout', text: '', resourceId: '', contentDesc: '',
          clickable: false, selected: false, checked: false, scrollable: false,
          children: [{
            className: 'ViewGroup', text: '', resourceId: '', contentDesc: '',
            clickable: false, selected: false, checked: false, scrollable: false,
            children: [{
              className: 'TextView', text: 'Deep', resourceId: '', contentDesc: '',
              clickable: false, selected: false, checked: false, scrollable: false,
              children: [],
            }],
          }],
        }],
      }],
    };

    collapseWrappers(root);
    // All 3 wrapper layers collapsed
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe('Deep');
  });

  it('should not use selected/checked as retention signals', () => {
    // A container with selected=true but no text/desc/clickable/scrollable should still collapse
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'FrameLayout', text: '', resourceId: '', contentDesc: '',
        clickable: false, selected: true, checked: true, scrollable: false,
        children: [{
          className: 'TextView', text: 'Label', resourceId: '', contentDesc: '',
          clickable: false, selected: false, checked: false, scrollable: false,
          children: [],
        }],
      }],
    };

    collapseWrappers(root);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe('Label');
  });
});

// =====================================================
// formatTreeToXml
// =====================================================

describe('formatTreeToXml', () => {
  it('should use className as XML tag name', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'Button', text: 'OK', resourceId: '', contentDesc: '',
        clickable: true, selected: false, checked: false, scrollable: false,
        children: [],
      }],
    };

    const xml = formatTreeToXml(root);
    expect(xml).toBe('<Button text="OK" clickable="true" />');
  });

  it('should include only non-empty/true attributes', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'TextView', text: 'Hi', resourceId: 'id/x', contentDesc: 'desc',
        clickable: false, selected: true, checked: false, scrollable: false,
        children: [],
      }],
    };

    const xml = formatTreeToXml(root);
    expect(xml).toContain('text="Hi"');
    expect(xml).toContain('resource-id="id/x"');
    expect(xml).toContain('content-desc="desc"');
    expect(xml).toContain('selected="true"');
    expect(xml).not.toContain('clickable');
    expect(xml).not.toContain('checked');
    expect(xml).not.toContain('scrollable');
  });

  it('should render nested children with indentation', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'ViewGroup', text: '', resourceId: '', contentDesc: 'parent',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [{
          className: 'TextView', text: 'child', resourceId: '', contentDesc: '',
          clickable: false, selected: false, checked: false, scrollable: false,
          children: [],
        }],
      }],
    };

    const xml = formatTreeToXml(root);
    const lines = xml.split('\n');
    expect(lines[0]).toBe('<ViewGroup content-desc="parent">');
    expect(lines[1]).toBe('  <TextView text="child" />');
    expect(lines[2]).toBe('</ViewGroup>');
  });

  it('should return empty string for empty tree', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [],
    };
    expect(formatTreeToXml(root)).toBe('');
  });

  it('should escape special XML characters in attributes', () => {
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'TextView', text: 'A & B <C> "D"', resourceId: '', contentDesc: '',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [],
      }],
    };

    const xml = formatTreeToXml(root);
    expect(xml).toContain('A &amp; B &lt;C&gt; &quot;D&quot;');
  });

  it('should truncate long text to MAX_TEXT_LENGTH', () => {
    const longText = 'A'.repeat(300);
    const root: FormatNode = {
      className: '', text: '', resourceId: '', contentDesc: '',
      clickable: false, selected: false, checked: false, scrollable: false,
      children: [{
        className: 'TextView', text: longText, resourceId: '', contentDesc: '',
        clickable: false, selected: false, checked: false, scrollable: false,
        children: [],
      }],
    };

    const xml = formatTreeToXml(root);
    // 200 chars + "..."
    expect(xml).toContain('A'.repeat(200) + '...');
    expect(xml).not.toContain('A'.repeat(201));
  });
});

// =====================================================
// Integration: full pipeline
// =====================================================

describe('full pipeline: parse → collapse → format', () => {
  const clockXml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="" resource-id="" class="android.widget.LinearLayout" package="com.example" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
      <node index="0" text="" resource-id="com.example:id/toolbar" class="android.view.ViewGroup" package="com.example" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,200]">
        <node index="0" text="Title" resource-id="com.example:id/title" class="android.widget.TextView" package="com.example" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][200,50]" />
        <node index="1" text="" resource-id="com.example:id/menu" class="android.widget.ImageView" package="com.example" content-desc="Menu" checkable="false" checked="false" clickable="true" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[900,0][1080,50]" />
      </node>
    </node>
  </node>
</hierarchy>`;

  it('should collapse wrapper layers and keep grouping containers', () => {
    const root = parseXmlToFormatTree(clockXml);
    collapseWrappers(root);
    const xml = formatTreeToXml(root);

    // toolbar kept (has resource-id + 2 children)
    expect(xml).toContain('<ViewGroup resource-id="com.example:id/toolbar">');
    // Title and Menu are direct children of toolbar
    expect(xml).toContain('text="Title"');
    expect(xml).toContain('content-desc="Menu"');
    expect(xml).toContain('clickable="true"');
    // FrameLayout and LinearLayout wrappers should be collapsed
    expect(xml).not.toContain('FrameLayout');
    expect(xml).not.toContain('LinearLayout');
  });

  it('should not include bounds in output', () => {
    const root = parseXmlToFormatTree(clockXml);
    collapseWrappers(root);
    const xml = formatTreeToXml(root);

    expect(xml).not.toContain('bounds');
    expect(xml).not.toContain('left=');
    expect(xml).not.toContain('top=');
    expect(xml).not.toContain('width=');
    expect(xml).not.toContain('height=');
  });

  it('should preserve selected state on tabs', () => {
    const xml = wrap(
      n({ 'resource-id': 'id/nav', class: 'android.widget.FrameLayout' },
        n({ 'content-desc': 'Home', clickable: 'true', class: 'android.widget.FrameLayout' },
          n({ text: 'Home', class: 'android.widget.TextView' })
        ) +
        n({ 'content-desc': 'Settings', selected: 'true', class: 'android.widget.FrameLayout' },
          n({ text: 'Settings', selected: 'true', class: 'android.widget.TextView' })
        )
      )
    );

    const root = parseXmlToFormatTree(xml);
    collapseWrappers(root);
    const output = formatTreeToXml(root);

    expect(output).toContain('content-desc="Home" clickable="true"');
    expect(output).toContain('content-desc="Settings" selected="true"');
    expect(output).toContain('text="Settings" selected="true"');
  });
});
