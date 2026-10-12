import { describe, expect, it, rs } from '@rstest/core';
import { revealExecutionStep } from './execution-panel-scroll';

function layout({
  buttonTop = 450,
  buttonBottom = 514,
  scrollTop = 0,
  sidebarTop = 400,
  mainHeight = 656,
} = {}) {
  const error = { scrollIntoView: rs.fn() };
  const sidebar = {
    scrollTop,
    clientTop: 0,
    clientHeight: 624,
    getBoundingClientRect: () => ({ top: sidebarTop }),
  };
  const main = {
    clientTop: 0,
    clientHeight: mainHeight,
    getBoundingClientRect: () => ({ top: 56 }),
  };
  const body = {
    querySelector: () => error,
    closest: () => main,
  } as unknown as HTMLElement;
  const button = {
    closest: () => sidebar,
    getBoundingClientRect: () => ({ top: buttonTop, bottom: buttonBottom }),
  } as unknown as HTMLElement;
  return { body, button, sidebar, error };
}

describe('execution step visibility', () => {
  it('reveals a late failure within the part of the sidebar visible on screen', () => {
    const { body, button, sidebar, error } = layout({
      buttonTop: 900,
      buttonBottom: 964,
    });
    revealExecutionStep(body, button, true);
    // The sidebar extends to 1024px, but the main viewport ends at 712px.
    expect(sidebar.scrollTop).toBe(252);
    expect(error.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('does not move a visible selection or scroll the detail area for a successful step', () => {
    const { body, button, sidebar, error } = layout({ scrollTop: 120 });
    revealExecutionStep(body, button, false);
    expect(sidebar.scrollTop).toBe(120);
    expect(error.scrollIntoView).not.toHaveBeenCalled();
  });

  it('reveals an earlier step above the sidebar viewport', () => {
    const { body, button, sidebar } = layout({
      buttonTop: 360,
      buttonBottom: 424,
      scrollTop: 300,
    });
    revealExecutionStep(body, button, false);
    expect(sidebar.scrollTop).toBe(260);
  });

  it('leaves the sidebar alone when it is outside the viewport on a stacked layout', () => {
    const { body, button, sidebar, error } = layout({ sidebarTop: -700 });
    revealExecutionStep(body, button, true);
    expect(sidebar.scrollTop).toBe(0);
    expect(error.scrollIntoView).toHaveBeenCalled();
  });
});
