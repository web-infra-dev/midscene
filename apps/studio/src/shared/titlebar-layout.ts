/** Layout values shared by the native window chrome and ShellLayout. */
export const TITLEBAR_CONTROL_TOP = 19;
export const TITLEBAR_CONTROL_HEIGHT = 22;
// Windows renders its native minimize/maximize/close controls over the right
// side of a `titleBarOverlay`. Keep renderer controls out of that hit area.
export const WINDOWS_TITLEBAR_CONTROL_INSET = 176;
// The native traffic-light glyph has a slightly higher visual center than a
// CSS control with the same box center. Lift the sidebar toggle to match it.
export const SIDEBAR_TOGGLE_TOP = TITLEBAR_CONTROL_TOP - 3;
export const MACOS_TRAFFIC_LIGHT_SIZE = 12;
// `hiddenInset` renders the traffic-light glyph 6px below its configured
// position. Account for that native inset so its visual center aligns with
// the renderer titlebar controls.
export const MACOS_HIDDEN_INSET_TRAFFIC_LIGHT_OFFSET = 6;

export const MACOS_TRAFFIC_LIGHT_POSITION = {
  x: 18,
  y:
    TITLEBAR_CONTROL_TOP +
    (TITLEBAR_CONTROL_HEIGHT - MACOS_TRAFFIC_LIGHT_SIZE) / 2 -
    MACOS_HIDDEN_INSET_TRAFFIC_LIGHT_OFFSET,
};

export function getRendererTitlebarRightInset(
  userAgent = globalThis.navigator?.userAgent,
): number {
  return /Windows NT/i.test(userAgent || '')
    ? WINDOWS_TITLEBAR_CONTROL_INSET
    : 0;
}
