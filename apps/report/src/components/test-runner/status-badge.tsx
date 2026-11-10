import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { type ReactNode, createElement } from 'react';

export const recoveryWarning = 'passed after retry';

export function RecoveryWarning({
  message = recoveryWarning,
}: { message?: string }) {
  return (
    <Tooltip
      title={message}
      placement="bottom"
      arrow={false}
      trigger={['hover', 'focus']}
      color="var(--runner-surface)"
      overlayInnerStyle={{ color: 'var(--runner-text)' }}
      getPopupContainer={(trigger) =>
        trigger.closest<HTMLElement>('.test-runner-report') ?? document.body
      }
    >
      <ExclamationCircleOutlined
        className="runner-recovery-warning"
        aria-label={message}
        tabIndex={0}
      />
    </Tooltip>
  );
}

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
      className: `runner-status-pill runner-status-badge is-${tone}${className ? ` ${className}` : ''}`,
    },
    quiet ? null : icon,
    createElement('span', null, label.toLowerCase()),
  );
}
