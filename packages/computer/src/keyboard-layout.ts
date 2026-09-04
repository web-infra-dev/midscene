/**
 * Physical base keys for shifted characters on en-US keyboard layouts.
 *
 * This is intentionally not a universal keyboard-layout map. Other layouts
 * can place these characters on different keys or modifier levels, such as
 * AltGr. Layout-independent support should resolve characters against the
 * active layout in the input backend instead of extending this table.
 */
export const US_SHIFTED_CHARACTER_KEYS: ReadonlyMap<string, string> = new Map([
  ['~', '`'],
  ['!', '1'],
  ['@', '2'],
  ['#', '3'],
  ['$', '4'],
  ['%', '5'],
  ['^', '6'],
  ['&', '7'],
  ['*', '8'],
  ['(', '9'],
  [')', '0'],
  ['_', '-'],
  ['+', '='],
  ['{', '['],
  ['}', ']'],
  ['|', '\\'],
  [':', ';'],
  ['"', "'"],
  ['<', ','],
  ['>', '.'],
  ['?', '/'],
]);
