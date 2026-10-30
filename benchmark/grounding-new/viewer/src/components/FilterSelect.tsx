import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: { value: string; text: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}

export function FilterSelect({
  id,
  label,
  value,
  options,
  open,
  onOpenChange,
  onChange,
}: FilterSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const typed = useRef({ buffer: '', at: 0 });
  const triggerId = `${id}-trigger`;
  const popupId = `${id}-options`;

  function close(restoreFocus = false) {
    onOpenChange(false);
    typed.current.buffer = '';
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function openMenu() {
    if (!options.length) return;
    const selected = options.findIndex((option) => option.value === value);
    setPosition(null);
    setActiveIndex(Math.max(0, selected));
    typed.current.buffer = '';
    onOpenChange(true);
  }

  function commit(index = activeIndex) {
    const option = options[index];
    if (!option) return;
    close(true);
    if (option.value !== value) onChange(option.value);
  }

  function typeahead(key: string) {
    const now = Date.now();
    const buffer =
      now - typed.current.at > 700 ? key : typed.current.buffer + key;
    typed.current = { buffer, at: now };
    const letters = Array.from(buffer);
    const query = (
      letters.every((letter) => letter === letters[0]) ? letters[0] : buffer
    ).toLocaleLowerCase();
    const selected = options.findIndex((option) => option.value === value);
    const current = open ? activeIndex : selected;
    const start = query.length === 1 ? current + 1 : current;
    const offset = options.findIndex((_, offset) =>
      options[(Math.max(0, start) + offset) % options.length].text
        .trim()
        .toLocaleLowerCase()
        .startsWith(query),
    );
    if (offset >= 0)
      setActiveIndex((Math.max(0, start) + offset) % options.length);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    if (key === 'Tab') {
      close();
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.stopPropagation();
      return;
    }
    if (key === 'Escape') {
      if (!open) return;
      close(true);
    } else if (key === 'Enter' || key === ' ') {
      if (open) commit();
      else openMenu();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (open)
        setActiveIndex(
          (activeIndex + (key === 'ArrowDown' ? 1 : -1) + options.length) %
            options.length,
        );
      else openMenu();
    } else if (key === 'Home' || key === 'End') {
      if (!open) openMenu();
      setActiveIndex(key === 'End' ? options.length - 1 : 0);
    } else if (key.length === 1) {
      if (!open) openMenu();
      typeahead(key);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    if (!trigger || !popup) return;
    const bounds = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const width = Math.min(
      Math.max(bounds.width, 180),
      Math.max(0, window.innerWidth - margin * 2),
    );
    const below = Math.max(
      0,
      window.innerHeight - bounds.bottom - gap - margin,
    );
    const above = Math.max(0, bounds.top - gap - margin);
    const contentHeight = popup.scrollHeight + 2;
    const placeAbove = below < Math.min(contentHeight, 320) && above > below;
    const maxHeight = Math.min(320, placeAbove ? above : below);
    const height = Math.min(contentHeight, maxHeight);
    const top = placeAbove ? bounds.top - gap - height : bounds.bottom + gap;
    setPosition({
      position: 'fixed',
      width,
      left: Math.max(
        margin,
        Math.min(bounds.left, window.innerWidth - width - margin),
      ),
      top: Math.max(
        margin,
        Math.min(top, window.innerHeight - height - margin),
      ),
      maxHeight,
    });

    function outside(event: Event) {
      if (
        event.target instanceof Node &&
        !popup?.contains(event.target) &&
        !trigger?.contains(event.target)
      )
        onOpenChange(false);
    }
    function onResize() {
      onOpenChange(false);
    }
    function onScroll(event: Event) {
      if (!(event.target instanceof Node) || !popup?.contains(event.target))
        onOpenChange(false);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, onOpenChange]);

  useLayoutEffect(() => {
    if (!open || !position) return;
    const option = popupRef.current?.children[activeIndex];
    if (option instanceof HTMLElement)
      option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [open, activeIndex, position]);

  return (
    <label className="filter-field" htmlFor={triggerId}>
      <span className="visually-hidden">{label}</span>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="filter-select-trigger"
        // biome-ignore lint/a11y/useSemanticElements: A controlled combobox keeps the styled listbox in a body portal.
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popupId}
        aria-activedescendant={
          open && activeIndex >= 0
            ? `${triggerId}-option-${activeIndex}`
            : undefined
        }
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="filter-select-value">
          {options.find((option) => option.value === value)?.text ?? ''}
        </span>
        <span className="filter-select-sizing" aria-hidden="true">
          {options.map((option) => (
            <span key={option.value}>{option.text}</span>
          ))}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popupRef}
            id={popupId}
            className="filter-options"
            // biome-ignore lint/a11y/useSemanticElements: The listbox is controlled through the trigger's aria-activedescendant.
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            style={position ?? { visibility: 'hidden' }}
            onPointerDown={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
          >
            {options.map((option, index) => (
              <div
                id={`${triggerId}-option-${index}`}
                key={option.value}
                // biome-ignore lint/a11y/useSemanticElements: Custom options belong to the portaled listbox and retain combobox focus.
                role="option"
                tabIndex={-1}
                aria-selected={option.value === value}
                className={`filter-option${option.value === value ? ' is-selected' : ''}${index === activeIndex ? ' is-active' : ''}`}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                {option.text}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </label>
  );
}
