/**
 * Player-only mode lets an embedding page strip every piece of report chrome
 * (nav bar, sidebar, timeline, detail side) and keep just the replay Player.
 *
 * Enable it by adding the `playerOnly` query param to the report URL, e.g.
 * `report.html?playerOnly=1`. It composes with the `#task-<id>` hash anchor,
 * so an embedder can deep-link to a specific step and show only its player.
 */

export const PLAYER_ONLY_PARAM = 'playerOnly';

// Mirrors the truthy set used by the other report query params (`focusOnCursor`,
// `showElementMarkers`, `darkMode`) in `@midscene/visualizer` store, kept local
// so this pure util has no dependency on that antd-heavy package.
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * Parse a raw location search string (e.g. `?playerOnly=1`) into a boolean.
 *
 * Semantics (intentionally a strict on/off mode switch):
 * - Absent param -> `false`.
 * - Truthy value (`1`/`true`/`yes`/`on`, case-insensitive) -> `true`.
 * - Any other value -> `false`.
 * - Unlike the other report params, a bare flag (`?playerOnly`) or an empty
 *   value (`?playerOnly=`) also enables the mode, so embedders can drop it in
 *   without a value.
 */
export function parsePlayerOnlyParam(search: string): boolean {
  const params = new URLSearchParams(search);
  if (!params.has(PLAYER_ONLY_PARAM)) {
    return false;
  }
  const value = params.get(PLAYER_ONLY_PARAM);
  if (value === null || value === '') {
    return true;
  }
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}

/** Whether the current page requested player-only mode via the URL. */
export function isPlayerOnlyMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return parsePlayerOnlyParam(window.location.search);
}
