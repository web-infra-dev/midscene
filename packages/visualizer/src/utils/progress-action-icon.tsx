import { type ReactNode, createElement } from 'react';

function CompletedActionIcon() {
  return createElement(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': true,
      focusable: false,
    },
    createElement('path', {
      d: 'M7.3335 12L10.6668 15.3334L17.3335 8.66669',
      stroke: '#188F4D',
      strokeWidth: '1.33333',
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
