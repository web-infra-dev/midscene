import { type ReactNode, useEffect, useRef, useState } from 'react';
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
    onSelect: (key: string) => void;
    selectedKey: string;
  };
  /** Label shown in the shell header. Defaults to `'Playground'`. */
  title?: string;
}

export function PlaygroundShell({
  children,
  modeMenu,
  title = 'Playground',
}: PlaygroundShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedItem = modeMenu?.items.find(
    (item) => item.key === modeMenu.selectedKey,
  );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [menuOpen]);

  return (
    <div className="playground-shell">
      <div className="app-drag absolute left-0 top-0 z-10 flex h-[56px] w-full items-center gap-[6px] border-b border-border-subtle bg-surface px-[22px]">
        {modeMenu ? (
          <div className="app-no-drag playground-shell-mode-menu" ref={menuRef}>
            <button
              aria-expanded={menuOpen}
              aria-label="Switch right panel mode"
              className="playground-shell-mode-button"
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div className="playground-shell-mode-popover" role="menu">
                {modeMenu.items.map((item) => (
                  <button
                    className="playground-shell-mode-item"
                    data-selected={item.key === modeMenu.selectedKey}
                    disabled={item.disabled}
                    key={item.key}
                    onClick={() => {
                      setMenuOpen(false);
                      modeMenu.onSelect(item.key);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {item.icon ? (
                      <span
                        aria-hidden="true"
                        className="playground-shell-mode-item-icon"
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <span className="text-[13px] leading-[22.1px] font-medium text-text-primary">
          {selectedItem?.label || title}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden pt-[56px]">{children}</div>
    </div>
  );
}
