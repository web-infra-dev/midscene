/**
 * @rstest-environment jsdom
 */
import { expect, it, rs } from '@rstest/core';
import { elementRect } from '../../src/extractor/util';

it('extracts transparent inputs without requiring browser visibility APIs', () => {
  const input = document.createElement('input');
  input.style.opacity = '0';
  Object.defineProperty(input, 'checkVisibility', { value: undefined });
  rs.spyOn(input, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 20, 30, 40),
  );

  expect(elementRect(input, window, document, 2)).toMatchObject({
    left: 20,
    top: 40,
    width: 60,
    height: 80,
  });
});
