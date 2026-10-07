import { type ReactNode, createElement } from 'react';

export function StatusBadge({
  label,
  tone,
  icon,
  quiet = false,
  className,
}: {
  label: string;
  tone: 'success' | 'warning' | 'failed' | 'neutral';
  icon?: ReactNode;
  quiet?: boolean;
  className?: string;
}): JSX.Element {
  return createElement(
    'span',
    {
      className: `runner-status-pill runner-status-badge is-${tone}${quiet ? ' is-quiet' : ''}${className ? ` ${className}` : ''}`,
    },
    quiet ? null : icon,
    createElement('span', null, label.toLowerCase()),
  );
}
