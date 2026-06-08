import { type ReactNode, createElement } from 'react';

function CompletedActionIcon() {
  return createElement(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': true,
      focusable: false,
    },
    createElement('path', {
      d: 'M3 7.99984L6.33333 11.3332L13 4.6665',
      stroke: '#188F4D',
      strokeWidth: '1.2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

/**
 * Default icon for a completed `InfoListItem.actionKind`. All action types
 * resolve to the same green checkmark glyph; callers can opt out by passing
 * an override via `ExecutionFlowConfig.resolveActionIcon`.
 */
export function defaultProgressActionIcon(_kind: string): ReactNode | null {
  return createElement(CompletedActionIcon);
}

/**
 * Resolve the icon for a progress action, applying the host's override
 * (if any) before falling back to the default mapping.
 */
export function resolveProgressActionIcon(
  kind: string | undefined,
  override?: (kind: string) => ReactNode | null | undefined,
): ReactNode | null {
  if (!kind) return null;
  if (override) {
    const custom = override(kind);
    if (custom !== undefined) return custom;
  }
  return defaultProgressActionIcon(kind);
}
