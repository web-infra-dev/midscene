import { PassThrough } from 'node:stream';
import { describe, expect, it, rs } from '@rstest/core';
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
    const done = rs.fn();
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

  it('decodes split UTF-8 independently for each stream', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const logs: string[] = [];
    const errors: string[] = [];
    const rendered: string[] = [];
    stdout.on('data', (chunk) => logs.push(chunk.toString()));
    stderr.on('data', (chunk) => errors.push(chunk.toString()));
    const done = rs.fn();
    const restore = captureTerminalOutput(
      (message, write) => {
        rendered.push(message);
        write(message.endsWith('\n') ? message : `${message}\n`);
      },
      [stdout, stderr],
    );

    const search = Buffer.from('搜索\n');
    const warning = Buffer.from('⚠️\n');
    try {
      stdout.write(search.subarray(0, 1), done);
      stderr.write(warning.subarray(0, 2));
      stdout.write(search.subarray(1));
      stderr.write(warning.subarray(2).toString('latin1'), 'latin1');
    } finally {
      restore();
    }

    await new Promise((resolve) => setImmediate(resolve));
    expect(done).toHaveBeenCalledOnce();
    expect(rendered).toEqual(['搜索\n', '⚠️\n']);
    expect(logs.join('')).toBe('搜索\n');
    expect(errors.join('')).toBe('⚠️\n');
  });

  it('flushes incomplete output once when restoring the stream', () => {
    const stream = new PassThrough();
    const output: string[] = [];
    stream.on('data', (chunk) => output.push(chunk.toString()));
    const restore = captureTerminalOutput(
      (message, write) => write(message),
      [stream],
    );
    try {
      stream.write(Buffer.from('搜').subarray(0, 2));
      expect(output).toEqual([]);
    } finally {
      restore();
    }
    restore();
    stream.write(' later\n');

    expect(output.join('')).toBe('� later\n');
  });
});
