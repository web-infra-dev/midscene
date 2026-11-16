/** Escape text so GitHub-flavored Markdown shows it literally on one line. */
export const markdownText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('|', '&#124;')
    .replaceAll('[', '&#91;')
    .replaceAll(']', '&#93;')
    .replaceAll('*', '&#42;')
    .replaceAll('_', '&#95;')
    .replaceAll('~', '&#126;')
    .replaceAll('`', '&#96;')
    .replaceAll('\\', '&#92;')
    .replace(/[\r\n]+/g, ' ');
