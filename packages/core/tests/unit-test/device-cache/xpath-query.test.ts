import { type UiNode, evaluateXpath, findRectByXpath } from '@/device-cache';
import { describe, expect, it } from 'vitest';

const node = (
  type: string,
  attrs: Record<string, string | undefined>,
  children: UiNode[] = [],
  bounds = { left: 0, top: 0, width: 100, height: 100 },
): UiNode => ({ type, attrs, bounds, children });

describe('evaluateXpath', () => {
  it('matches root by child axis when name matches', () => {
    const root = node('Window', {});
    expect(evaluateXpath(root, '/Window')).toEqual([root]);
  });

  it('does not match root by child axis when name differs', () => {
    const root = node('Window', {});
    expect(evaluateXpath(root, '/Other')).toEqual([]);
  });

  it('walks children with the child axis', () => {
    const child = node('Button', { name: 'a' });
    const root = node('Window', {}, [child]);
    expect(evaluateXpath(root, '/Window/Button')).toEqual([child]);
  });

  it('walks all descendants with the descendant axis', () => {
    const inner = node('Button', { name: 'a' });
    const outer = node('Group', {}, [inner]);
    const root = node('Window', {}, [outer]);
    expect(evaluateXpath(root, '//Button')).toEqual([inner]);
  });

  it('respects attribute predicates with single quotes', () => {
    const a = node('Button', { name: 'login' });
    const b = node('Button', { name: 'cancel' });
    const root = node('Window', {}, [a, b]);
    expect(evaluateXpath(root, "//Button[@name='login']")).toEqual([a]);
  });

  it('respects attribute predicates with double quotes', () => {
    const a = node('Button', { name: "it's me" });
    const root = node('Window', {}, [a]);
    expect(evaluateXpath(root, '//Button[@name="it\'s me"]')).toEqual([a]);
  });

  it('respects 1-based positional predicates', () => {
    const a = node('Button', { idx: 'first' });
    const b = node('Button', { idx: 'second' });
    const c = node('Button', { idx: 'third' });
    const root = node('Window', {}, [a, b, c]);
    expect(evaluateXpath(root, '/Window/Button[2]')).toEqual([b]);
  });

  it('combines attribute and positional predicates', () => {
    const a = node('Button', { name: 'foo' });
    const b = node('Button', { name: 'foo' });
    const c = node('Button', { name: 'bar' });
    const root = node('Window', {}, [a, b, c]);
    expect(evaluateXpath(root, "/Window/Button[@name='foo'][2]")).toEqual([b]);
  });

  it('uses the wildcard tag for any name', () => {
    const a = node('Button', { id: 'x' });
    const b = node('Image', { id: 'x' });
    const root = node('Window', {}, [a, b]);
    expect(evaluateXpath(root, "//*[@id='x']")).toEqual([a, b]);
  });

  it('returns empty when an intermediate step has no match', () => {
    const a = node('Button', { name: 'a' });
    const root = node('Window', {}, [a]);
    expect(evaluateXpath(root, '/Window/Group/Button')).toEqual([]);
  });

  it('throws on an unsupported predicate', () => {
    const root = node('Window', {});
    expect(() => evaluateXpath(root, '/Window[name()="Window"]')).toThrow();
  });

  it('throws on a missing axis prefix', () => {
    const root = node('Window', {});
    expect(() => evaluateXpath(root, 'Window')).toThrow();
  });
});

describe('findRectByXpath', () => {
  it('returns the bounds of the first matching node', () => {
    const target = node('Button', { name: 'a' }, [], {
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    });
    const root = node('Window', {}, [target]);
    expect(findRectByXpath(root, '//Button')).toEqual({
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    });
  });

  it('returns undefined when no node matches', () => {
    const root = node('Window', {});
    expect(findRectByXpath(root, '//Button')).toBeUndefined();
  });
});
