import type { ReactNode } from 'react';
import {
  type ConnectionStatus,
  ConnectionStatusDot,
} from './ConnectionStatusDot';
import './playground-shell-skin.css';

export interface PlaygroundShellProps {
  children: ReactNode;
  /** Label shown in the shell header. Defaults to `'Playground'`. */
  title?: string;
  /**
   * Device connection status indicator rendered next to the title.
   * Omit to hide the dot entirely (e.g. on screens that don't represent
   * a session).
   */
  connectionStatus?: ConnectionStatus;
}

export function PlaygroundShell({
  children,
  title = 'Playground',
  connectionStatus,
}: PlaygroundShellProps) {
  return (
    <div className="playground-shell">
      <div className="app-drag absolute left-0 top-0 z-10 flex h-[56px] w-full items-center gap-[6px] border-b border-border-subtle bg-surface px-[22px]">
        {connectionStatus ? (
          <ConnectionStatusDot status={connectionStatus} />
        ) : null}
        <span className="text-[13px] leading-[22.1px] font-medium text-text-primary">
          {title}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden pt-[56px]">{children}</div>
    </div>
  );
}
