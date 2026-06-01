import { parseXml } from '@/device-cache';
import { describe, expect, it } from 'vitest';

describe('parseXml', () => {
  it('parses a single self-closing root', () => {
    const root = parseXml('<Window x="0" y="0"/>');
    expect(root.name).toBe('Window');
    expect(root.attrs).toEqual({ x: '0', y: '0' });
    expect(root.children).toEqual([]);
  });

  it('parses nested elements with attributes', () => {
    const xml =
      '<root id="r"><child name="a"/><child name="b"><leaf k="v"/></child></root>';
    const root = parseXml(xml);
    expect(root.name).toBe('root');
    expect(root.children).toHaveLength(2);
    expect(root.children[0].attrs).toEqual({ name: 'a' });
    expect(root.children[1].children[0].name).toBe('leaf');
    expect(root.children[1].children[0].attrs).toEqual({ k: 'v' });
  });

  it('strips xml prolog and comments', () => {
    const xml = '<?xml version="1.0"?><!-- a comment --><root><a/></root>';
    const root = parseXml(xml);
    expect(root.name).toBe('root');
    expect(root.children).toHaveLength(1);
  });

  it('decodes common XML entities in attribute values', () => {
    const root = parseXml(
      '<node label="A &amp; B" name="&lt;ok&gt;" tag="&quot;x&quot;"/>',
    );
    expect(root.attrs.label).toBe('A & B');
    expect(root.attrs.name).toBe('<ok>');
    expect(root.attrs.tag).toBe('"x"');
  });

  it('decodes numeric entities', () => {
    const root = parseXml('<n v="&#65;&#x42;"/>');
    expect(root.attrs.v).toBe('AB');
  });

  it('throws on unbalanced tags', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
  });

  it('throws on more than one top-level element', () => {
    expect(() => parseXml('<a/><b/>')).toThrow();
  });

  it('throws on empty input', () => {
    expect(() => parseXml('')).toThrow();
  });

  it('handles tag names with dots and dashes (android.widget.Button)', () => {
    const root = parseXml(
      '<hierarchy><node class="android.widget.Button"><other-tag/></node></hierarchy>',
    );
    expect(root.children[0].attrs.class).toBe('android.widget.Button');
    expect(root.children[0].children[0].name).toBe('other-tag');
  });

  it('preserves whitespace inside attribute values', () => {
    const root = parseXml('<n label="hello world  trailing"/>');
    expect(root.attrs.label).toBe('hello world  trailing');
  });

  it('handles single-quoted attribute values', () => {
    const root = parseXml(`<n name='it"s ok'/>`);
    expect(root.attrs.name).toBe('it"s ok');
  });
});
