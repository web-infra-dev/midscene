import { describe, expect, it } from 'vitest';
import {
  OMITTED_SCREENSHOT_BASE64_TEXT,
  sanitizeJsonViewData,
} from '../src/components/detail-panel/json-view-data';

describe('sanitizeJsonViewData', () => {
  it('removes screenshot base64 fields without touching other screenshot metadata', () => {
    const result = sanitizeJsonViewData({
      uiContext: {
        screenshot: {
          base64: 'data:image/png;base64,AAA',
          capturedAt: 123,
        },
      },
      recorder: [
        {
          screenshot: {
            base64: 'data:image/jpeg;base64,BBB',
            capturedAt: 456,
          },
        },
      ],
    });

    expect(result).toEqual({
      uiContext: {
        screenshot: {
          capturedAt: 123,
        },
      },
      recorder: [
        {
          screenshot: {
            capturedAt: 456,
          },
        },
      ],
    });
  });

  it('preserves non-screenshot base64 fields', () => {
    const result = sanitizeJsonViewData({
      payload: {
        base64: 'data:image/png;base64,AAA',
      },
    });

    expect(result).toEqual({
      payload: {
        base64: 'data:image/png;base64,AAA',
      },
    });
  });

  it('replaces direct image strings under screenshot paths', () => {
    const result = sanitizeJsonViewData({
      screenshot: 'data:image/png;base64,AAA',
      image: 'data:image/png;base64,BBB',
    });

    expect(result).toEqual({
      screenshot: OMITTED_SCREENSHOT_BASE64_TEXT,
      image: 'data:image/png;base64,BBB',
    });
  });

  it('does not invoke screenshot base64 lazy getters', () => {
    let base64GetterCalled = false;
    const screenshot = Object.defineProperties(
      {},
      {
        base64: {
          enumerable: true,
          get() {
            base64GetterCalled = true;
            return 'data:image/png;base64,AAA';
          },
        },
        capturedAt: {
          enumerable: true,
          value: 123,
        },
      },
    );

    const result = sanitizeJsonViewData({ uiContext: { screenshot } });

    expect(base64GetterCalled).toBe(false);
    expect(result).toEqual({
      uiContext: {
        screenshot: {
          capturedAt: 123,
        },
      },
    });
  });

  it('marks circular references without recursing forever', () => {
    const value: { name: string; self?: unknown } = { name: 'root' };
    value.self = value;

    expect(sanitizeJsonViewData(value)).toEqual({
      name: 'root',
      self: '[Circular]',
    });
  });

  it('expands shared child objects instead of treating them as circular', () => {
    const child = { value: 1 };
    const result = sanitizeJsonViewData({
      first: child,
      second: child,
    });

    expect(result).toEqual({
      first: { value: 1 },
      second: { value: 1 },
    });
  });

  it('replaces a full UI tree root with a compact summary', () => {
    const result = sanitizeJsonViewData({
      uiContext: {
        uiTree: {
          platform: 'android',
          capturedAt: 123,
          xpathPolicy: {
            stableAttrs: ['resource-id'],
            textAttrs: ['content-desc', 'text'],
            excludedTargetTypes: [],
            max: 3,
          },
          root: {
            type: 'Root',
            attrs: { large: 'root attrs should be omitted' },
            bounds: { left: 0, top: 0, width: 100, height: 100 },
            children: [
              {
                type: 'Child',
                attrs: { text: 'child attrs should be omitted' },
                bounds: { left: 0, top: 0, width: 10, height: 10 },
                children: [],
              },
            ],
          },
        },
      },
    }) as {
      uiContext: { uiTree: { root: Record<string, unknown> } };
    };

    expect(result.uiContext.uiTree.root).toMatchObject({
      type: 'Root',
      childCount: 1,
      nodeCount: 2,
    });
    expect(result.uiContext.uiTree.root).not.toHaveProperty('attrs');
    expect(result.uiContext.uiTree.root).not.toHaveProperty('children');
  });
});
