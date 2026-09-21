import type { ReactNode } from 'react';
import './playground-shell-skin.css';

export interface PlaygroundShellModeMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface PlaygroundShellProps {
  actions?: ReactNode;
  children: ReactNode;
  modeMenu?: {
    items: PlaygroundShellModeMenuItem[];
    selectedKey: string;
  };
  showHeader?: boolean;
  /** Label shown in the shell header. Defaults to `'API Playground'`. */
  title?: string;
}

export function PlaygroundShell({
  actions,
  children,
  modeMenu,
  showHeader = true,
  title = 'API Playground',
}: PlaygroundShellProps) {
  const selectedItem = modeMenu?.items.find(
    (item) => item.key === modeMenu.selectedKey,
  );

  return (
    <div className="playground-shell">
      {showHeader ? (
        <div className="app-drag absolute left-0 top-0 z-10 flex h-[52px] w-full items-center justify-between gap-[12px] border-b border-border-subtle bg-surface px-[12px]">
          <div className="flex min-w-0 items-center gap-[6px]">
            {modeMenu ? (
              <div className="playground-shell-mode-menu">
                <span aria-hidden="true" className="playground-shell-mode-icon">
                  {selectedItem?.icon ? (
                    <span
                      aria-hidden="true"
                      className="playground-shell-mode-button-icon"
                    >
                      {selectedItem.icon}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
            <span className="truncate text-[13px] leading-[22.1px] font-medium text-text-primary">
              {selectedItem?.label || title}
            </span>
          </div>
          {actions ? (
            <div className="app-no-drag flex shrink-0 items-center gap-[8px]">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={
          showHeader
            ? 'min-h-0 flex-1 overflow-hidden pt-[52px]'
            : 'min-h-0 flex-1 overflow-hidden'
        }
      >
        {children}
      </div>
    </div>
  );
}
