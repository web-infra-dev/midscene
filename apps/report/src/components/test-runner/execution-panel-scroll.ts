/** Reveal error details, then scroll only the sidebar to expose its selection. */
export function revealExecutionStep(
  body: HTMLElement,
  button: HTMLElement,
  revealError: boolean,
): void {
  if (revealError) {
    body
      .querySelector<HTMLElement>('.runner-error-card')
      ?.scrollIntoView({ block: 'nearest' });
  }
  const sidebar = button.closest<HTMLElement>('.runner-detail-step-scroll');
  const main = body.closest<HTMLElement>('.runner-main');
  if (!sidebar || !main) return;

  const sidebarTop = sidebar.getBoundingClientRect().top + sidebar.clientTop;
  const mainTop = main.getBoundingClientRect().top + main.clientTop;
  const top = Math.max(sidebarTop, mainTop);
  const bottom = Math.min(
    sidebarTop + sidebar.clientHeight,
    mainTop + main.clientHeight,
  );
  if (bottom <= top) return;

  const bounds = button.getBoundingClientRect();
  const delta =
    bounds.top < top
      ? bounds.top - top
      : bounds.bottom > bottom
        ? bounds.bottom - bottom
        : 0;
  const previousScroll = sidebar.scrollTop;
  sidebar.scrollTop += delta;
  // Near the end of a short list the sidebar may reach its scroll limit
  // before the selection clears the main viewport. Reveal the remainder there.
  main.scrollTop += delta - (sidebar.scrollTop - previousScroll);
}
