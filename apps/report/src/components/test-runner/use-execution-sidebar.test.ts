import { describe, expect, it } from '@rstest/core';
import {
  clampExecutionSidebar,
  executionSidebarBounds,
} from './use-execution-sidebar';

describe('execution sidebar resizing', () => {
  it('keeps the requested width within the available detail space', () => {
    expect(clampExecutionSidebar(320, 1200)).toBe(320);
    expect(clampExecutionSidebar(-100, 1200)).toBe(240);
    expect(clampExecutionSidebar(1000, 1200)).toBe(832);
  });

  it('reduces a wide sidebar after its container shrinks', () => {
    expect(clampExecutionSidebar(700, 900)).toBe(532);
    expect(executionSidebarBounds(900)).toEqual({ min: 240, max: 532 });
  });

  it('never produces reversed bounds when space is constrained', () => {
    expect(executionSidebarBounds(500)).toEqual({ min: 240, max: 240 });
    expect(clampExecutionSidebar(320, 500)).toBe(240);
  });
});
