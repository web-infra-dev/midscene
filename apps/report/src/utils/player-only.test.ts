import { describe, expect, it } from 'vitest';
import { parsePlayerViewOptions } from './player-only';

describe('parsePlayerViewOptions', () => {
  it('defaults every flag to false when the params are absent', () => {
    expect(parsePlayerViewOptions('')).toEqual({
      playerOnly: false,
      playControl: false,
      autoPlay: false,
    });
  });

  it('enables each flag only for the exact value "1"', () => {
    expect(parsePlayerViewOptions('?player-only=1')).toMatchObject({
      playerOnly: true,
    });
    expect(parsePlayerViewOptions('?play-control=1')).toMatchObject({
      playControl: true,
    });
    expect(parsePlayerViewOptions('?auto-play=1')).toMatchObject({
      autoPlay: true,
    });
  });

  it('does not accept truthy aliases or a bare flag', () => {
    for (const value of ['true', 'yes', 'on', '2', '01', '']) {
      expect(parsePlayerViewOptions(`?player-only=${value}`).playerOnly).toBe(
        false,
      );
    }
    expect(parsePlayerViewOptions('?player-only').playerOnly).toBe(false);
  });

  it('parses all three flags together', () => {
    expect(
      parsePlayerViewOptions('?player-only=1&play-control=1&auto-play=1'),
    ).toEqual({ playerOnly: true, playControl: true, autoPlay: true });
  });
});
