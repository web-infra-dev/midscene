import type { KeyboardEvent } from 'react';

export function handleTabKeyDown(
  event: KeyboardEvent<HTMLElement>,
  current: number,
  count: number,
  orientation: 'horizontal' | 'vertical',
  select: (index: number) => void,
) {
  const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  let next: number | undefined;
  if (event.key === previousKey) next = (current - 1 + count) % count;
  else if (event.key === nextKey) next = (current + 1) % count;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = count - 1;
  if (next === undefined) return;

  event.preventDefault();
  select(next);
  const tabs = event.currentTarget
    .closest('[role="tablist"]')
    ?.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs?.[next]?.focus();
}
