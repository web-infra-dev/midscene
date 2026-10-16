import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, rs } from '@rstest/core';
import { ObservationFrameSource } from '../../src/observation-frame-source';
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mP4HKzauIeNgXXZh/+7OAApSwYLCdgqFgAAAABJRU5ErkJggg==';
const wire = (frameId = '1', startMs = 440, clockId = 'guest:boot') =>
  `${JSON.stringify({
    version: 1,
    frameId,
    width: 2,
    height: 2,
    pngBase64,
    timing: { clockId, startMs, endMs: startMs, kind: 'compositor-frame' },
  })}\n`;
function source() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: rs.fn(),
  });
  return {
    child,
    source: new ObservationFrameSource(
      child as unknown as ChildProcessWithoutNullStreams,
    ),
  };
}
describe('native observation transport', () => {
  it('assembles split frames atomically and keeps source time after delayed delivery and stop', async () => {
    const { child, source: s } = source();
    const listener = rs.fn();
    s.subscribe(listener);
    const line = wire();
    child.stdout.write(line.slice(0, 30));
    expect(s.latest()).toBeNull();
    child.stdout.write(line.slice(30));
    const frame = s.latest()!;
    expect(frame.timing?.startMs).toBe(440);
    expect(frame.frameId).toBe('1');
    expect(listener).toHaveBeenCalledTimes(1);
    await s.stop();
    expect(await s.decode([frame])).toEqual([
      `data:image/png;base64,${pngBase64}`,
    ]);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.stdin.destroyed).toBe(true);
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
  });
  it('rejects duplicate identities, reversed times, foreign clocks and unexpected EOF', () => {
    for (const bad of [wire('1'), wire('2', 400), wire('2', 450, 'host')]) {
      const { child, source: s } = source();
      child.stdout.write(wire());
      child.stdout.write(bad);
      expect(() => s.latest()).toThrow();
    }
    const { child, source: s } = source();
    child.emit('close', 0);
    expect(() => s.latest()).toThrow('coverage ended');
  });
  it('rejects inconsistent PNG dimensions', () => {
    const { child, source: s } = source();
    child.stdout.write(wire().replace('"width":2', '"width":3'));
    expect(() => s.latest()).toThrow('dimensions');
  });
});

it('closes inherited pipes when a wrapper exits before its producer', async () => {
  const producer = `const frame=${JSON.stringify(JSON.parse(wire()))};let n=0;setInterval(()=>{frame.frameId=String(++n);process.stdout.write(JSON.stringify(frame)+'\\n')},20);setTimeout(()=>process.exit(),2000)`;
  const wrapper = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(producer)}],{stdio:'inherit'})`;
  const child = spawn(process.execPath, ['-e', wrapper]);
  const s = new ObservationFrameSource(child);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Producer baseline timeout')),
        3000,
      );
      s.subscribe(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
    const closed = new Promise<void>((resolve) =>
      child.once('close', () => resolve()),
    );
    const before = performance.now();
    await s.stop();
    await closed;
    expect(performance.now() - before).toBeLessThan(750);
  } finally {
    await s.stop();
    child.kill('SIGKILL');
  }
});

const geometry = {
  outputIndex: 0,
  x: 3,
  y: 0,
  width: 2,
  height: 2,
  scale: 1,
  outputWidth: 10,
  outputHeight: 10,
  transform: 0 as const,
};
const regionWire = (id = '12-1', overrides = {}) => ({
  ...JSON.parse(wire(id)),
  geometry: { scope: 'region', ...geometry },
  ...overrides,
});
const pause = () => new Promise((r) => setTimeout(r, 20));
it('rejects region pixels at the Agent full-screen source boundary', () => {
  const { child, source: s } = source();
  child.stdout.write(`${JSON.stringify(regionWire())}\n`);
  expect(() => s.latest()).toThrow('full-screen');
});
it('region channel preserves atomic geometry, pixels, identity and source time after stop', async () => {
  const { RegionObservation } = await import(
    '../../src/observation-frame-source'
  );
  const record = regionWire();
  const s = RegionObservation.start({
    command: process.execPath,
    args: [
      '-e',
      `process.stdout.write(${JSON.stringify(`${JSON.stringify(record)}\n`)});setInterval(()=>{},1000)`,
    ],
    geometry,
    maxFrames: 2,
  });
  try {
    for (let i = 0; i < 100 && !s.frames().length; i++) await pause();
    const frame = s.frames()[0];
    expect(frame.frameId).toBe('12-1');
    expect(frame.geometry).toEqual(geometry);
    expect(frame.timing.startMs).toBe(440);
    expect(frame.png.toString('base64')).toBe(pngBase64);
    frame.png.fill(0);
    frame.timing.startMs = 0;
    await s.stop();
    expect(s.frames()[0].png.toString('base64')).toBe(pngBase64);
    expect(s.frames()[0].timing.startMs).toBe(440);
    expect('latest' in s).toBe(false);
    expect('decode' in s).toBe(false);
  } finally {
    await s.stop();
  }
});
it('region channel rejects missing frames, changed geometry/clock, overflow and EOF', async () => {
  const { RegionObservation } = await import(
    '../../src/observation-frame-source'
  );
  const cases = [
    {
      records: [regionWire('12-1'), regionWire('12-3')],
      maxFrames: 3,
      message: 'sequence gap',
    },
    {
      records: [
        regionWire('12-1', {
          geometry: { ...geometry, scope: 'region', x: 4 },
        }),
      ],
      maxFrames: 3,
      message: 'geometry',
    },
    {
      records: [
        regionWire('12-1'),
        regionWire('12-2', {
          timing: {
            clockId: 'other',
            startMs: 440,
            endMs: 440,
            kind: 'compositor-frame',
          },
        }),
      ],
      maxFrames: 3,
      message: 'clock domain',
    },
    {
      records: [regionWire('12-1'), regionWire('12-2')],
      maxFrames: 1,
      message: 'overflow',
    },
    {
      records: [regionWire()],
      maxFrames: 3,
      message: 'coverage ended',
      eof: true,
    },
  ];
  for (const c of cases) {
    const s = RegionObservation.start({
      command: process.execPath,
      args: [
        '-e',
        `process.stdout.write(${JSON.stringify(`${c.records.map((r) => JSON.stringify(r)).join('\n')}\n`)});${c.eof ? '' : 'setInterval(()=>{},1000)'}`,
      ],
      geometry,
      maxFrames: c.maxFrames,
    });
    try {
      let error: unknown;
      for (let i = 0; i < 100; i++) {
        await pause();
        try {
          s.frames();
        } catch (e) {
          error = e;
          break;
        }
      }
      expect(String(error)).toContain(c.message);
      await s.stop();
      expect(() => s.frames()).toThrow(c.message);
    } finally {
      await s.stop();
    }
  }
});

it('rejects incomplete runtime geometry and byte bounds before spawning a process', async () => {
  const { RegionObservation } = await import(
    '../../src/observation-frame-source'
  );
  for (const key of Object.keys(geometry)) {
    const incomplete = { ...geometry };
    delete (incomplete as Record<string, number>)[key];
    expect(() =>
      RegionObservation.start({
        command: '/must-not-start',
        geometry: incomplete,
        maxFrames: 1,
      }),
    ).toThrow('Invalid region geometry');
  }
  for (const maxFrameBytes of [0, -1, 1.5, Number.NaN]) {
    expect(() =>
      RegionObservation.start({
        command: '/must-not-start',
        geometry,
        maxFrames: 1,
        maxFrameBytes,
      }),
    ).toThrow('Invalid frame byte limit');
  }
});
