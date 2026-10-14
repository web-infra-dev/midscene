import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ObservationFrameSource } from '@/observation-frame-source';
import { describe, expect, it, rs } from '@rstest/core';
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
