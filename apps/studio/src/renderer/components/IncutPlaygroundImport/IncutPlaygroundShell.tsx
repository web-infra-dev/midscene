import type { ReactNode } from 'react';
import './incut-playground-skin.css';

export interface IncutPlaygroundShellProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function IncutPlaygroundShell({
  children,
  className,
  title = 'Playground',
}: IncutPlaygroundShellProps) {
  return (
    <div
      className={['incut-playground-shell', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-[56px] w-full items-center border-b border-border-subtle bg-surface px-[22px]">
        <span className="text-[13px] leading-[22.1px] font-medium text-text-primary">
          {title}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden pt-[56px]">{children}</div>
    </div>
  );
}
