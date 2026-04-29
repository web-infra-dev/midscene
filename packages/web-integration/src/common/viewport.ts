import { assert } from '@midscene/shared/utils';

export interface ViewportSize {
  width: number;
  height: number;
}

export const defaultViewportWidth = 1400;
export const defaultViewportHeight = 900;
export const defaultViewportSize: ViewportSize = {
  width: defaultViewportWidth,
  height: defaultViewportHeight,
};

function parseViewportDimension(
  rawValue: number | string,
  name: 'viewportWidth' | 'viewportHeight',
): number {
  const parsedValue =
    typeof rawValue === 'number' ? rawValue : Number(rawValue);

  assert(
    Number.isInteger(parsedValue),
    `${name} must be a positive integer, but got ${rawValue}`,
  );
  assert(
    parsedValue > 0,
    `${name} must be greater than 0, but got ${rawValue}`,
  );

  return parsedValue;
}

export function resolveViewportSize(
  viewport?: {
    width?: number | string | null;
    height?: number | string | null;
  },
  fallback: ViewportSize = defaultViewportSize,
): ViewportSize {
  const width =
    viewport?.width === undefined || viewport.width === null
      ? fallback.width
      : parseViewportDimension(viewport.width, 'viewportWidth');
  const height =
    viewport?.height === undefined || viewport.height === null
      ? fallback.height
      : parseViewportDimension(viewport.height, 'viewportHeight');

  return { width, height };
}

export function resolveWebViewportSize(
  viewport?: {
    viewportWidth?: number | string | null;
    viewportHeight?: number | string | null;
  },
  fallback: ViewportSize = defaultViewportSize,
): ViewportSize {
  return resolveViewportSize(
    {
      width: viewport?.viewportWidth,
      height: viewport?.viewportHeight,
    },
    fallback,
  );
}
