/**
 * URL flags that let an embedding page (e.g. an iframe) tailor the report's
 * player.
 *
 * - `player-only=1`  strip all report chrome (nav, sidebar, timeline, detail
 *   side) and keep just the replay player. Opt-in; enabled only by `=1`.
 * - `play-control=1` show the bottom playback control bar (player-only mode).
 *   Opt-in; enabled only by `=1`.
 * - `auto-play`      whether playback starts automatically on load. Independent
 *   of `player-only` and applies to every report player. On by default; set
 *   `auto-play=0` to disable.
 *
 * Example: `report.html?player-only=1&play-control=1&auto-play=0`.
 */

export const PLAYER_ONLY_PARAM = 'player-only';
export const PLAY_CONTROL_PARAM = 'play-control';
export const AUTO_PLAY_PARAM = 'auto-play';

export interface PlayerViewOptions {
  /** Render only the replay player, hiding every other piece of report UI. */
  playerOnly: boolean;
  /** Show the bottom playback control bar. */
  playControl: boolean;
  /** Start playback automatically on load. Defaults to true. */
  autoPlay: boolean;
}

/** An opt-in flag is enabled only when its value is exactly `1`. */
function isFlagEnabled(params: URLSearchParams, name: string): boolean {
  return params.get(name) === '1';
}

/** Parse a raw location search string (e.g. `?player-only=1`) into options. */
export function parsePlayerViewOptions(search: string): PlayerViewOptions {
  const params = new URLSearchParams(search);
  return {
    playerOnly: isFlagEnabled(params, PLAYER_ONLY_PARAM),
    playControl: isFlagEnabled(params, PLAY_CONTROL_PARAM),
    // On by default; only an explicit `auto-play=0` turns autoplay off.
    autoPlay: params.get(AUTO_PLAY_PARAM) !== '0',
  };
}

/** Read the player view options from the current page URL. */
export function getPlayerViewOptions(): PlayerViewOptions {
  if (typeof window === 'undefined') {
    return { playerOnly: false, playControl: false, autoPlay: true };
  }
  return parsePlayerViewOptions(window.location.search);
}
