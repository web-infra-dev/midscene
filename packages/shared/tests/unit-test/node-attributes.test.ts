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
  it('joins class names that are separated by any whitespace', () => {
    expect(
      attributesOf([
        { name: 'class', value: '  flex\n    items-center\tgap-2  ' },
      ]),
    ).toEqual({ class: '.flex.items-center.gap-2' });
  });

  it('keeps a class list separated by single spaces', () => {
    expect(
      attributesOf([
        { name: 'class', value: 'btn btn-primary' },
        { name: 'type', value: 'submit' },
      ]),
    ).toEqual({ class: '.btn.btn-primary', type: 'submit' });
  });
});
