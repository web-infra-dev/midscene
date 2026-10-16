import { WarningFilled } from '@ant-design/icons';
import { type ReactNode, createElement } from 'react';

export const recoveryWarning =
  'An earlier attempt failed. Inspect attempts for details.';

export function RecoveryWarning({
  message = recoveryWarning,
}: { message?: string }) {
  return (
    <WarningFilled
      className="runner-recovery-warning"
      aria-label={message}
      title={message}
    />
  );
}

export function StatusBadge({
  label,
  tone,
  icon,
  quiet = false,
  className,
  warning,
}: {
  label: string;
  tone: 'success' | 'warning' | 'failed' | 'neutral';
  icon?: ReactNode;
  quiet?: boolean;
  className?: string;
  warning?: string;
}): JSX.Element {
  return createElement(
    'span',
    {
      className: `runner-status-pill runner-status-badge is-${tone}${className ? ` ${className}` : ''}`,
    },
    quiet ? null : icon,
    createElement('span', null, label.toLowerCase()),
    warning ? createElement(RecoveryWarning, { message: warning }) : null,
  );
}
