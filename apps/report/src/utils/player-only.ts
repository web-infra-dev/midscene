/**
 * URL flags that let an embedding page (e.g. an iframe) tailor the report's
 * player. Each flag is a strict `=1` switch — no `true`/`yes`/`on` aliases.
 *
 * - `player-only=1`  strip all report chrome (nav, sidebar, timeline, detail
 *   side) and keep just the replay player.
 * - `play-control=1` show the bottom playback control bar.
 * - `auto-play=1`    start playback automatically on load.
 *
 * Example: `report.html?player-only=1&play-control=1&auto-play=1`.
 */

export const PLAYER_ONLY_PARAM = 'player-only';
export const PLAY_CONTROL_PARAM = 'play-control';
export const AUTO_PLAY_PARAM = 'auto-play';

export interface PlayerViewOptions {
  /** Render only the replay player, hiding every other piece of report UI. */
  playerOnly: boolean;
  /** Show the bottom playback control bar. */
  playControl: boolean;
  /** Start playback automatically on load. */
  autoPlay: boolean;
}

/** A flag is enabled only when its value is exactly `1`. */
function isFlagEnabled(params: URLSearchParams, name: string): boolean {
  return params.get(name) === '1';
}

/** Parse a raw location search string (e.g. `?player-only=1`) into options. */
export function parsePlayerViewOptions(search: string): PlayerViewOptions {
  const params = new URLSearchParams(search);
  return {
    playerOnly: isFlagEnabled(params, PLAYER_ONLY_PARAM),
    playControl: isFlagEnabled(params, PLAY_CONTROL_PARAM),
    autoPlay: isFlagEnabled(params, AUTO_PLAY_PARAM),
  };
}

/** Read the player view options from the current page URL. */
export function getPlayerViewOptions(): PlayerViewOptions {
  if (typeof window === 'undefined') {
    return { playerOnly: false, playControl: false, autoPlay: false };
  }
  return parsePlayerViewOptions(window.location.search);
}
