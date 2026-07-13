import { describe, expect, it } from 'vitest';
import {
  MACOS_TRAFFIC_LIGHT_POSITION,
  MACOS_TRAFFIC_LIGHT_SIZE,
  TITLEBAR_CONTROL_HEIGHT,
  TITLEBAR_CONTROL_TOP,
} from '../src/shared/titlebar-layout';

describe('Studio titlebar layout', () => {
  it('vertically centers macOS traffic lights with ShellLayout controls', () => {
    expect(MACOS_TRAFFIC_LIGHT_POSITION).toEqual({ x: 18, y: 19 });
    expect(MACOS_TRAFFIC_LIGHT_POSITION.y + MACOS_TRAFFIC_LIGHT_SIZE / 2).toBe(
      TITLEBAR_CONTROL_TOP + TITLEBAR_CONTROL_HEIGHT / 2,
    );
  });
});
