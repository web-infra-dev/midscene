import { expect, it, rs } from '@rstest/core';
import { IOSWebDriverClient } from '../../src/ios-webdriver-client';
import { readScrollGeometry } from '../../src/scroll-geometry';

const viewport = { x: 10, y: 20, width: 100, height: 200 };
const child = (name: string, x = -20) => ({
  type: 'StaticText',
  name,
  rect: { x, y: 30, width: 50, height: 20 },
});
const scroll = (
  children: unknown[] = [child('Private left label'), child('Second', 20)],
) => ({ type: 'ScrollView', isVisible: '1', rect: viewport, children });
const source = (children: unknown[] = [scroll()]) => ({
  type: 'Application',
  name: 'App',
  children,
});

it('reports positive off-screen geometry without exposing native labels', () => {
  const geometry = readScrollGeometry(source())!;
  expect(geometry.viewport).toEqual(viewport);
  expect(geometry.offscreenDirections).toEqual(['left']);
  expect(Object.keys(geometry.anchors)).toHaveLength(2);
  expect(JSON.stringify(geometry)).not.toContain('Private left label');
  expect(JSON.stringify(geometry)).not.toContain('Second');
});
it('does not infer a scroll boundary from absence of clipped child frames', () => {
  expect(
    readScrollGeometry(source([scroll([child('a', 20)])]))?.offscreenDirections,
  ).toEqual([]);
});
it.each([
  ['multiple containers', source([scroll(), scroll()])],
  ['nested containers', source([scroll([scroll()])])],
  ['no native container', source([child('canvas')])],
  ['empty custom view', source([scroll([])])],
  [
    'invalid viewport',
    source([{ ...scroll(), rect: { ...viewport, width: 0 } }]),
  ],
  ['hidden container', source([{ ...scroll(), isVisible: '0' }])],
  ['malformed source', null],
])('declines %s', (_label, input) =>
  expect(readScrollGeometry(input)).toBeUndefined(),
);
it('rejects duplicate anchor identities and bounds anchor count', () => {
  const geometry = readScrollGeometry(
    source([
      scroll([
        child('duplicate'),
        child('duplicate'),
        ...Array.from({ length: 40 }, (_, i) => child(`id-${i}`)),
      ]),
    ]),
  )!;
  expect(Object.keys(geometry.anchors)).toHaveLength(32);
});
it('queries JSON source through the active session with a bounded timeout', async () => {
  const client = new IOSWebDriverClient({ host: 'localhost', port: 8100 });
  Object.assign(client, { sessionId: 'geometry-test' });
  const request = rs
    .spyOn(
      client as unknown as {
        makeRequest: (...args: unknown[]) => Promise<unknown>;
      },
      'makeRequest',
    )
    .mockResolvedValue({ value: source() });
  try {
    expect(await client.captureScrollGeometry()).toEqual(
      readScrollGeometry(source()),
    );
    expect(request).toHaveBeenCalledWith(
      'GET',
      '/session/geometry-test/source?format=json',
      undefined,
      { timeout: 3000 },
    );
  } finally {
    request.mockRestore();
  }
});

it('uses nativeFrame to avoid WDA integer rounding looking like child resizing', () => {
  const preciseChild = {
    ...child('fractional'),
    rect: { x: -20, y: 30, width: 51, height: 20 },
    nativeFrame: '{{-19.6666666667, 30}, {50, 20}}',
  };
  const g = readScrollGeometry(source([scroll([preciseChild])]))!;
  expect(Object.values(g.anchors)[0]).toEqual({
    x: -19.6666666667,
    y: 30,
    width: 50,
    height: 20,
  });
});
it('falls back to validated rectangles when nativeFrame is unavailable or malformed', () => {
  const g = readScrollGeometry(
    source([scroll([{ ...child('a'), nativeFrame: 'not a CGRect' }])]),
  )!;
  expect(Object.values(g.anchors)[0]).toEqual(child('a').rect);
});
