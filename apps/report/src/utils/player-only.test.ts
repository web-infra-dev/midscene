import { describe, expect, it } from 'vitest';
import { parsePlayerViewOptions } from './player-only';

describe('parsePlayerViewOptions', () => {
  it('defaults player-only/play-control off and auto-play on when absent', () => {
    expect(parsePlayerViewOptions('')).toEqual({
      playerOnly: false,
      playControl: false,
      autoPlay: true,
    });
  });

  it('enables opt-in flags only for the exact value "1"', () => {
    expect(parsePlayerViewOptions('?player-only=1')).toMatchObject({
      playerOnly: true,
    });
    expect(parsePlayerViewOptions('?play-control=1')).toMatchObject({
      playControl: true,
    });
  });

  it('does not accept truthy aliases or a bare flag for opt-in flags', () => {
    for (const value of ['true', 'yes', 'on', '2', '01', '']) {
      expect(parsePlayerViewOptions(`?player-only=${value}`).playerOnly).toBe(
        false,
      );
    }
    expect(parsePlayerViewOptions('?player-only').playerOnly).toBe(false);
  });

  it('treats auto-play as on by default and off only for "0"', () => {
    expect(parsePlayerViewOptions('?auto-play=0').autoPlay).toBe(false);
    expect(parsePlayerViewOptions('?auto-play=1').autoPlay).toBe(true);
    // Absent or any non-"0" value keeps autoplay on.
    expect(parsePlayerViewOptions('?auto-play').autoPlay).toBe(true);
    expect(parsePlayerViewOptions('?foo=bar').autoPlay).toBe(true);
  });

  it('auto-play is independent of player-only', () => {
    expect(parsePlayerViewOptions('?auto-play=0')).toMatchObject({
      playerOnly: false,
      autoPlay: false,
    });
    expect(parsePlayerViewOptions('?player-only=1&auto-play=0')).toMatchObject({
      playerOnly: true,
      autoPlay: false,
    });
  });
});
