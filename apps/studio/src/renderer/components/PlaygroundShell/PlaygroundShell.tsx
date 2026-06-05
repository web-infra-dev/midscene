import type { ReactNode } from 'react';
import './playground-shell-skin.css';

export interface PlaygroundShellModeMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface PlaygroundShellProps {
  children: ReactNode;
  modeMenu?: {
    items: PlaygroundShellModeMenuItem[];
    selectedKey: string;
  };
  /** Label shown in the shell header. Defaults to `'API Playground'`. */
  title?: string;
}

export function PlaygroundShell({
  children,
  modeMenu,
  title = 'API Playground',
}: PlaygroundShellProps) {
  const selectedItem = modeMenu?.items.find(
    (item) => item.key === modeMenu.selectedKey,
  );

  return (
    <div className="playground-shell">
      <div className="app-drag absolute left-0 top-0 z-10 flex h-[52px] w-full items-center gap-[6px] border-b border-border-subtle bg-surface px-[22px]">
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
        <span className="text-[13px] leading-[22.1px] font-medium text-text-primary">
          {selectedItem?.label || title}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden pt-[48px]">{children}</div>
    </div>
  );
}
