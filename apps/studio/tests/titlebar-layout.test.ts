import { describe, expect, it } from 'vitest';
import {
  MACOS_HIDDEN_INSET_TRAFFIC_LIGHT_OFFSET,
  MACOS_TRAFFIC_LIGHT_POSITION,
  MACOS_TRAFFIC_LIGHT_SIZE,
  SIDEBAR_TOGGLE_TOP,
  TITLEBAR_CONTROL_HEIGHT,
  TITLEBAR_CONTROL_TOP,
  WINDOWS_TITLEBAR_CONTROL_INSET,
  getRendererTitlebarRightInset,
} from '../src/shared/titlebar-layout';

describe('Studio titlebar layout', () => {
  it('raises the sidebar toggle to match the native traffic-light glyph', () => {
    expect(SIDEBAR_TOGGLE_TOP).toBe(16);
  });

  it('centers macOS traffic lights with ShellLayout controls', () => {
    expect(MACOS_TRAFFIC_LIGHT_POSITION).toEqual({ x: 18, y: 18 });
    expect(
      MACOS_TRAFFIC_LIGHT_POSITION.y +
        MACOS_HIDDEN_INSET_TRAFFIC_LIGHT_OFFSET +
        MACOS_TRAFFIC_LIGHT_SIZE / 2,
    ).toBe(TITLEBAR_CONTROL_TOP + TITLEBAR_CONTROL_HEIGHT / 2);
  });

  it('reserves the Windows window-control region in renderer titlebars', () => {
    expect(getRendererTitlebarRightInset('Windows NT 10.0')).toBe(
      WINDOWS_TITLEBAR_CONTROL_INSET,
    );
    expect(getRendererTitlebarRightInset('Macintosh')).toBe(0);
  });
});
