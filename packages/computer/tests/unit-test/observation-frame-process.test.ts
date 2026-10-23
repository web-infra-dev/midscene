import { spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import {
  ObservationFrameSource,
  RegionObservation,
} from '../../src/observation-frame-source';

rs.mock('node:child_process', () => ({
  spawn: rs.fn(() => {
    throw new Error('Unexpected process launch');
  }),
}));

beforeEach(() => {
  rs.clearAllMocks();
});

describe('observation process validation', () => {
  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    'rejects frame byte limit %s before either factory spawns',
    (maxFrameBytes) => {
      const options = { command: '/must-not-start', maxFrameBytes };
      expect(() => ObservationFrameSource.start(options)).toThrow(
        'Invalid frame byte limit',
      );
      expect(() =>
        RegionObservation.start({
          ...options,
          geometry: {
            outputIndex: 0,
            x: 0,
            y: 0,
            width: 2,
            height: 2,
            scale: 1,
            outputWidth: 2,
            outputHeight: 2,
            transform: 0,
          },
          maxFrames: 1,
        }),
      ).toThrow('Invalid frame byte limit');
      expect(spawn).not.toHaveBeenCalled();
    },
  );
});
