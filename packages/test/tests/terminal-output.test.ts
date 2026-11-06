import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { captureTerminalOutput } from '../src/cli/terminal-output';

describe('CLI terminal stream capture', () => {
  it('routes stdout/stderr through the live renderer, preserving destinations and restoring both streams', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const original = [stdout.write, stderr.write];
    const logs: string[] = [];
    const errors: string[] = [];
    const observed: string[] = [];
    stdout.on('data', (chunk) => logs.push(chunk.toString()));
    stderr.on('data', (chunk) => errors.push(chunk.toString()));
    const done = vi.fn();
    const restore = captureTerminalOutput(
      (message, write) => {
        observed.push(message);
        write(message);
      },
      [stdout, stderr],
    );
    try {
      stdout.write(Buffer.from('搜索 👩‍💻\n'), done);
      stderr.write('a warning\n', 'utf8');
    } finally {
      restore();
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(done).toHaveBeenCalledOnce();
    expect(observed).toEqual(['搜索 👩‍💻\n', 'a warning\n']);
    expect(logs).toEqual(['搜索 👩‍💻\n']);
    expect(errors).toEqual(['a warning\n']);
    expect(stdout.write).toBe(original[0]);
    expect(stderr.write).toBe(original[1]);
  });

  it('returns the original backpressure signal and restores after an output error', () => {
    const stream = new PassThrough({ highWaterMark: 1 });
    const original = stream.write;
    const restore = captureTerminalOutput(
      (message, write) => write(message),
      [stream],
    );
    try {
      expect(stream.write('full buffer')).toBe(false);
    } finally {
      restore();
    }
    expect(stream.write).toBe(original);
    const stop = captureTerminalOutput(() => {
      throw new Error('output unavailable');
    }, [stream]);
    try {
      expect(() => stream.write('message')).toThrow('output unavailable');
    } finally {
      stop();
    }
    expect(stream.write).toBe(original);
  });
});
