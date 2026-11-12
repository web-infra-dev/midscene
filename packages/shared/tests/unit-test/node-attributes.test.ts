import { describe, expect, it } from '@rstest/core';
import { getNodeAttributes } from '../../src/extractor/util';

class FakeElement {
  constructor(public attributes: { name: string; value: string }[]) {}
}

const fakeWindow = {
  HTMLElement: FakeElement,
} as unknown as typeof globalThis.window;

const attributesOf = (attributes: { name: string; value: string }[]) =>
  getNodeAttributes(new FakeElement(attributes) as any, fakeWindow);

describe('getNodeAttributes', () => {
  it('joins class names that are separated by HTML ASCII whitespace', () => {
    expect(
      attributesOf([
        { name: 'class', value: '  flex\n\r    items-center\tgap-2\f  ' },
      ]),
    ).toEqual({ class: '.flex.items-center.gap-2' });
  });

  it.each(['\u00a0', '\u2003', '\u000b', '\ufeff'])(
    'preserves non-HTML whitespace %j inside a class name',
    (character) => {
      expect(
        attributesOf([{ name: 'class', value: ` a${character}b c ` }]),
      ).toEqual({ class: `.a${character}b.c` });
    },
  );

  it('keeps a class list separated by single spaces', () => {
    expect(
      attributesOf([
        { name: 'class', value: 'btn btn-primary' },
        { name: 'type', value: 'submit' },
      ]),
    ).toEqual({ class: '.btn.btn-primary', type: 'submit' });
  });
});
