import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './studio-action-menu.css';

export interface StudioActionMenuItem {
  danger?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
}

export function StudioActionMenu({
  ariaLabel,
  items,
  triggerClassName,
}: {
  ariaLabel: string;
  items: StudioActionMenuItem[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateMenuPosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }

      setMenuPosition({
        left: triggerRect.right - 160,
        top: triggerRect.bottom + 8,
      });
    };

    const handleOutsidePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    updateMenuPosition();
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    document.addEventListener('mousedown', handleOutsidePointerDown, true);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      );
      document.removeEventListener('mousedown', handleOutsidePointerDown, true);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  const menu =
    open && menuPosition
      ? createPortal(
          <div
            className="studio-action-menu"
            ref={menuRef}
            role="menu"
            style={menuPosition}
          >
            {items.map((item) => (
              <button
                className={
                  item.danger
                    ? 'studio-action-menu-item studio-action-menu-item-danger'
                    : 'studio-action-menu-item'
                }
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  void item.onClick();
                }}
                role="menuitem"
                type="button"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={triggerClassName}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((isOpen) => !isOpen);
        }}
        ref={triggerRef}
        type="button"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
          <circle cx="4" cy="8" fill="currentColor" r="1.2" />
          <circle cx="8" cy="8" fill="currentColor" r="1.2" />
          <circle cx="12" cy="8" fill="currentColor" r="1.2" />
        </svg>
      </button>
      {menu}
    </>
  );
}
