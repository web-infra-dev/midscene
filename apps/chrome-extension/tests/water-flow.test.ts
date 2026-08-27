/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

type WaterFlowAnimation = Window['midsceneWaterFlowAnimation'];

describe('water-flow pointer lifecycle', () => {
  let animation: WaterFlowAnimation;

  beforeEach(async () => {
    rs.resetModules();
    rs.useFakeTimers();
    rs.stubGlobal(
      'requestAnimationFrame',
      rs.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    (window as Partial<Window>).midsceneWaterFlowAnimation = undefined;

    await import('../src/scripts/water-flow');
    animation = window.midsceneWaterFlowAnimation;
  });

  afterEach(() => {
    animation.disable();
    rs.clearAllTimers();
    rs.useRealTimers();
    rs.unstubAllGlobals();
    (window as Partial<Window>).midsceneWaterFlowAnimation = undefined;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('adopts a pointer found in the DOM and reuses the cache', () => {
    const existingPointer = document.createElement('div');
    existingPointer.setAttribute(animation.mousePointerAttribute, 'true');
    document.body.appendChild(existingPointer);
    const querySelectorSpy = rs.spyOn(document, 'querySelector');

    animation.showMousePointer(20, 30);
    expect(animation.pointerElement).toBe(existingPointer);
    expect(querySelectorSpy).toHaveBeenCalledTimes(1);

    querySelectorSpy.mockClear();
    animation.showMousePointer(40, 50);
    expect(animation.pointerElement).toBe(existingPointer);
    expect(querySelectorSpy).not.toHaveBeenCalled();
  });

  it('replaces a cached pointer that was detached externally', () => {
    animation.showMousePointer(20, 30);
    const detachedPointer = animation.pointerElement;
    expect(detachedPointer).not.toBeNull();
    detachedPointer?.remove();

    animation.showMousePointer(40, 50);

    expect(animation.pointerElement).not.toBe(detachedPointer);
    expect(document.body.contains(animation.pointerElement)).toBe(true);
  });

  it('does not let an old timeout clear a newer pointer', async () => {
    animation.showMousePointer(20, 30);
    animation.hideMousePointer();
    await rs.advanceTimersByTimeAsync(1_000);

    animation.showMousePointer(40, 50);
    const currentPointer = animation.pointerElement;
    await rs.advanceTimersByTimeAsync(2_500);

    expect(animation.pointerElement).toBe(currentPointer);
    expect(document.body.contains(currentPointer)).toBe(true);
  });

  it('clears the cache when timeout, hide, or disable removes the pointer', async () => {
    animation.showMousePointer(20, 30);
    await rs.advanceTimersByTimeAsync(3_500);
    expect(animation.pointerElement).toBeNull();

    animation.showMousePointer(30, 40);
    animation.hideMousePointer();
    expect(animation.pointerElement).toBeNull();

    animation.showMousePointer(40, 50);
    animation.disable();
    expect(animation.pointerElement).toBeNull();
    expect(
      document.querySelectorAll(`div[${animation.mousePointerAttribute}]`),
    ).toHaveLength(0);
  });
});
