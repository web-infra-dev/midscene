import { type ReactNode, createElement } from 'react';

export function StatusBadge({
  label,
  tone,
  icon,
  quiet = false,
}: {
  label: string;
  tone: 'success' | 'warning' | 'failed' | 'neutral';
  icon?: ReactNode;
  quiet?: boolean;
}): JSX.Element {
  return createElement(
    'span',
    {
      className: `runner-status-pill runner-status-badge is-${tone}${quiet ? ' is-quiet' : ''}`,
    },
    quiet ? null : icon,
    createElement('span', null, label),
  );
}
