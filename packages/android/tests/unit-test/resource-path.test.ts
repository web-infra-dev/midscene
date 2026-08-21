import { describe, expect, it } from '@rstest/core';
import { resolveExternalResourcePath } from '../../src/resource-path';

describe('resolveExternalResourcePath', () => {
  it('uses the unpacked sibling when it exists', () => {
    const resourcePath =
      '/Applications/Midscene Studio.app/Contents/Resources/app.asar/node_modules/@midscene/android/bin/yadb';
    const unpackedPath = resourcePath.replace('.asar/', '.asar.unpacked/');

    expect(
      resolveExternalResourcePath(
        resourcePath,
        (path) => path === unpackedPath,
      ),
    ).toBe(unpackedPath);
  });

  it('uses the unpacked Windows sibling when it exists', () => {
    const resourcePath = String.raw`C:\Program Files\Midscene Studio\resources\app.asar\node_modules\@midscene\android\bin\yadb`;
    const unpackedPath = String.raw`C:\Program Files\Midscene Studio\resources\app.asar.unpacked\node_modules\@midscene\android\bin\yadb`;

    expect(
      resolveExternalResourcePath(
        resourcePath,
        (path) => path === unpackedPath,
      ),
    ).toBe(unpackedPath);
  });

  it('keeps the original path when no unpacked sibling exists', () => {
    const resourcePath =
      '/tmp/app.asar/node_modules/@midscene/android/bin/yadb';

    expect(resolveExternalResourcePath(resourcePath, () => false)).toBe(
      resourcePath,
    );
  });

  it('keeps ordinary Node paths unchanged', () => {
    const resourcePath = '/workspace/node_modules/@midscene/android/bin/yadb';

    expect(resolveExternalResourcePath(resourcePath)).toBe(resourcePath);
  });
});
