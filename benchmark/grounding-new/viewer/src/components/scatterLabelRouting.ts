import {
  dotRadius,
  markerStrokeWidth,
  minVisibleLength,
} from './scatterGeometry';

type Point = { x: number; y: number };
type Bounds = { x: number; y: number; width: number; height: number };
type Label = Bounds & { id: string; cx: number; cy: number };

const EPSILON = 1e-7;
const clearance = 3;
// Normal (non-hover) marker geometry, including the existing white outlines.
const dotOuterRadius = dotRadius + markerStrokeWidth / 2;
const labelOutline = markerStrokeWidth / 2;
type Interval = [number, number];
type Mask = {
  source: Point;
  cy: number;
  left: number;
  right: number;
  radius: number;
  bounds: Bounds;
};
type Pin = {
  point: Point;
  lead: Point;
  direction: number;
  side: number;
  hiddenLength: number;
};

const samePoint = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

// Drop zero-length and collinear segments without changing their directions.
function simplify(points: Point[]) {
  return points.reduce<Point[]>((result, point) => {
    const last = result.at(-1);
    if (last && samePoint(last, point)) return result;
    const before = result.at(-2);
    if (before && last) {
      const ax = last.x - before.x;
      const ay = last.y - before.y;
      const bx = point.x - last.x;
      const by = point.y - last.y;
      if (Math.abs(ax * by - ay * bx) < EPSILON && ax * bx + ay * by > 0) {
        result.pop();
      }
    }
    result.push(point);
    return result;
  }, []);
}

// Liang–Barsky segment/rectangle clipping.
function clipRect(a: Point, b: Point, box: Bounds): [number, number] | null {
  if (
    Math.max(a.x, b.x) < box.x ||
    Math.min(a.x, b.x) > box.x + box.width ||
    Math.max(a.y, b.y) < box.y ||
    Math.min(a.y, b.y) > box.y + box.height
  )
    return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let first = 0;
  let last = 1;
  const tests = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < EPSILON) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) first = Math.max(first, t);
    else last = Math.min(last, t);
    if (first > last) return null;
  }
  return [first, last];
}

function clipCircle(
  a: Point,
  b: Point,
  center: Point,
  radius: number,
): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ox = a.x - center.x;
  const oy = a.y - center.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = ox * dx + oy * dy;
  const discriminant =
    projection * projection -
    lengthSquared * (ox * ox + oy * oy - radius * radius);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = Math.max(0, (-projection - root) / lengthSquared);
  const last = Math.min(1, (-projection + root) / lengthSquared);
  return first <= last ? [first, last] : null;
}

// A pill's outer white outline is the union of a rectangle and two circles.
function makeMask(label: Label): Mask {
  const cy = label.y + label.height / 2;
  const radius = label.height / 2 + labelOutline;
  return {
    source: { x: label.cx, y: label.cy },
    cy,
    radius,
    left: label.x + label.height / 2,
    right: label.x + label.width - label.height / 2,
    bounds: {
      x: label.x - labelOutline,
      y: cy - radius,
      width: label.width + 2 * labelOutline,
      height: 2 * radius,
    },
  };
}

function pillCovered(mask: Mask, a: Point, b: Point, padding = 0): Interval[] {
  const radius = mask.radius + padding;
  return [
    clipRect(a, b, {
      x: mask.left,
      y: mask.cy - radius,
      width: mask.right - mask.left,
      height: 2 * radius,
    }),
    clipCircle(a, b, { x: mask.left, y: mask.cy }, radius),
    clipCircle(a, b, { x: mask.right, y: mask.cy }, radius),
  ].filter((interval): interval is Interval => interval !== null);
}

function covered(mask: Mask, a: Point, b: Point): Interval[] {
  const dot = clipCircle(a, b, mask.source, dotOuterRadius);
  return [...(dot ? [dot] : []), ...pillCovered(mask, a, b)];
}

function outside(mask: Mask, a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return covered(mask, a, b).every(
    ([first, last]) => (last - first) * length <= EPSILON,
  );
}

// Pins are on the visible outline, not under the source dot or label. If the
// markers overlap, leave the connected covered region before starting a wire.
function makePin(
  origin: Point,
  vector: Point,
  side: number,
  mask: Mask,
): Pin | undefined {
  const span =
    2 *
    (Math.abs(origin.x - mask.source.x) +
      Math.abs(origin.y - mask.source.y) +
      mask.bounds.width +
      mask.bounds.height +
      4 * minVisibleLength);
  const far = { x: origin.x + vector.x * span, y: origin.y + vector.y * span };
  let exit = 0;
  for (const [first, last] of covered(mask, origin, far).sort(
    (a, b) => a[0] - b[0],
  )) {
    if (first > exit + EPSILON) break;
    exit = Math.max(exit, last);
  }
  const point = {
    x: origin.x + vector.x * span * exit,
    y: origin.y + vector.y * span * exit,
  };
  const lead = {
    x: point.x + vector.x * minVisibleLength,
    y: point.y + vector.y * minVisibleLength,
  };
  return outside(mask, point, lead)
    ? {
        point,
        lead,
        side,
        direction: direction(point, lead),
        hiddenLength: span * exit,
      }
    : undefined;
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function intersectsSegment(a: Point, b: Point, c: Point, d: Point) {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.min(a.x, b.x) > Math.max(c.x, d.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
    Math.min(a.y, b.y) > Math.max(c.y, d.y)
  )
    return false;
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  // Shared endpoints are unavoidable for coincident scatter points.
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d))
    return false;
  if (
    Math.abs(abC) < EPSILON &&
    Math.abs(abD) < EPSILON &&
    Math.abs(cdA) < EPSILON &&
    Math.abs(cdB) < EPSILON
  )
    return true;
  return abC * abD <= 0 && cdA * cdB <= 0;
}

function segments(points: Point[]) {
  return points.slice(1).map((end, i) => [points[i], end] as const);
}

function initialPaths(start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  return [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    [start, { x: start.x + sx * diagonal, y: start.y + sy * diagonal }, end],
    [start, { x: end.x - sx * diagonal, y: end.y - sy * diagonal }, end],
  ].map(simplify);
}

const direction = (a: Point, b: Point) =>
  (Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) + 8) % 8;
const turnCost = (from: number, to: number) => {
  const turn = Math.min(Math.abs(from - to), 8 - Math.abs(from - to));
  return turn > 2 ? Number.POSITIVE_INFINITY : turn ? 40 : 0;
};

// Every returned segment is already visible. No hidden endpoint allowance or
// per-segment compensation is needed after routing.
function legal(path: Point[], mask: Mask) {
  if (path.length < 2) return false;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (
      Math.hypot(dx, dy) < minVisibleLength - EPSILON ||
      (dx > EPSILON && dy > EPSILON && Math.abs(dx - dy) > EPSILON) ||
      !outside(mask, a, b)
    )
      return false;
    if (
      i > 1 &&
      !Number.isFinite(turnCost(direction(path[i - 2], a), direction(a, b)))
    )
      return false;
  }
  return true;
}

const vectors = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];
// Compare whole routes, not a sum of independently charged wire segments.
type Quality = [
  outsideFrame: number,
  markerHits: number,
  wireCrossings: number,
  bends: number,
  clearanceHits: number,
  length: number,
];
const compareQuality = (a: Quality, b: Quality) => {
  const index = a.findIndex((value, i) => Math.abs(value - b[i]) > EPSILON);
  return index < 0 ? 0 : a[index] - b[index];
};
const hasConflict = (quality: Quality) =>
  quality[0] > 0 || quality[1] > 0 || quality[2] > 0 || quality[4] > 0;
type Route = { path: Point[]; source: Pin; target: Pin; quality: Quality };
type Obstacle =
  | { kind: 'label'; item: Label; mask: Mask }
  | { kind: 'dot'; item: Label }
  | { kind: 'wire'; id: string; path: Point[]; a: Point; b: Point };

// Only the broad phase uses grid cells; all penalties retain exact geometry.
function spatialIndex<T>(cellSize: number) {
  const cells = new Map<string, T[]>();
  const all = new Set<T>();
  const large = new Set<T>();
  const range = (box: Bounds) => ({
    left: Math.floor(box.x / cellSize),
    right: Math.floor((box.x + box.width) / cellSize),
    top: Math.floor(box.y / cellSize),
    bottom: Math.floor((box.y + box.height) / cellSize),
  });
  const oversized = (box: ReturnType<typeof range>) =>
    (box.right - box.left + 1) * (box.bottom - box.top + 1) > 4096;
  return {
    add(box: Bounds, item: T) {
      all.add(item);
      const bounds = range(box);
      // Bound memory for unusually large coordinates without skipping obstacles.
      if (oversized(bounds)) {
        large.add(item);
        return;
      }
      for (let x = bounds.left; x <= bounds.right; x++)
        for (let y = bounds.top; y <= bounds.bottom; y++) {
          const key = `${x},${y}`;
          const bucket = cells.get(key) ?? [];
          bucket.push(item);
          cells.set(key, bucket);
        }
    },
    query(box: Bounds) {
      const bounds = range(box);
      if (oversized(bounds)) return all;
      const found = new Set(large);
      for (let x = bounds.left; x <= bounds.right; x++)
        for (let y = bounds.top; y <= bounds.bottom; y++)
          for (const item of cells.get(`${x},${y}`) ?? []) found.add(item);
      return found;
    },
  };
}

const segmentBounds = (a: Point, b: Point): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

/** Route visible marker outlines with H/V/45 segments of at least five pixels. */
export function routeLabels(
  labels: Label[],
  frame?: Bounds,
): Map<string, Point[]> {
  const routes = new Map<string, Route>();
  const obstacles = labels.map((item) => ({
    item,
    mask: makeMask(item),
    box: {
      x: item.x - clearance - labelOutline,
      y: item.y - clearance - labelOutline,
      width: item.width + 2 * (clearance + labelOutline),
      height: item.height + 2 * (clearance + labelOutline),
    },
  }));
  const area = frame
    ? frame.width * frame.height
    : Math.max(1, ...labels.map(({ width }) => width)) *
      Math.max(1, ...labels.map(({ height }) => height)) *
      labels.length;
  const index = spatialIndex<Obstacle>(
    Math.max(
      4 * minVisibleLength,
      Math.sqrt(area / Math.max(1, labels.length)),
    ),
  );
  for (const { item, mask, box } of obstacles) {
    index.add(box, { kind: 'label', item, mask });
    const radius = dotOuterRadius + clearance;
    index.add(
      {
        x: item.cx - radius,
        y: item.cy - radius,
        width: 2 * radius,
        height: 2 * radius,
      },
      { kind: 'dot', item },
    );
  }
  let searchBudget = labels.length <= 48 ? 10 : labels.length <= 100 ? 4 : 0;
  const ordered = [...labels].sort(
    (a, b) =>
      Math.hypot(a.cx - a.x - a.width / 2, a.cy - a.y - a.height / 2) -
        Math.hypot(b.cx - b.x - b.width / 2, b.cy - b.y - b.height / 2) ||
      a.id.localeCompare(b.id),
  );

  const route = (label: Label) => {
    const mask = makeMask(label);
    const sources = vectors
      .map((v, i) => makePin(mask.source, v, (i / 2 + 1) % 4, mask))
      .filter((p): p is Pin => p !== undefined);
    const nominalPorts = [
      { x: label.x + label.width / 2, y: label.y, nx: 0, ny: -1 },
      { x: label.x + label.width, y: label.y + label.height / 2, nx: 1, ny: 0 },
      { x: label.x + label.width / 2, y: label.y + label.height, nx: 0, ny: 1 },
      { x: label.x, y: label.y + label.height / 2, nx: -1, ny: 0 },
    ];
    const targets = nominalPorts.flatMap((p, side) =>
      vectors
        .filter((v) => v.x * p.nx + v.y * p.ny > EPSILON)
        .map((v) => makePin(p, v, side, mask))
        .filter((pin): pin is Pin => pin !== undefined),
    );
    const quality = (path: Point[]): Quality => {
      const hits = new Set<Obstacle>();
      const near = new Set<Obstacle>();
      const crossings = new Set<string>();
      let outsideFrame = 0;
      let length = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const span = Math.hypot(b.x - a.x, b.y - a.y);
        length += span;
        if (
          frame &&
          (Math.min(a.x, b.x) < frame.x ||
            Math.min(a.y, b.y) < frame.y ||
            Math.max(a.x, b.x) > frame.x + frame.width ||
            Math.max(a.y, b.y) > frame.y + frame.height)
        )
          outsideFrame = 1;
        for (const obstacle of index.query(segmentBounds(a, b))) {
          if (obstacle.kind === 'wire') {
            if (
              obstacle.id !== label.id &&
              routes.get(obstacle.id)?.path === obstacle.path &&
              intersectsSegment(a, b, obstacle.a, obstacle.b)
            )
              crossings.add(obstacle.id);
          } else if (obstacle.item.id !== label.id && !hits.has(obstacle)) {
            if (obstacle.kind === 'label') {
              if (
                pillCovered(obstacle.mask, a, b).some(
                  ([first, last]) => (last - first) * span > EPSILON,
                )
              )
                hits.add(obstacle);
              else if (
                !near.has(obstacle) &&
                pillCovered(obstacle.mask, a, b, clearance).some(
                  ([first, last]) => (last - first) * span > EPSILON,
                )
              )
                near.add(obstacle);
            } else {
              const dot = { x: obstacle.item.cx, y: obstacle.item.cy };
              if (!samePoint(dot, mask.source)) {
                const distance = distanceToSegment(dot, a, b);
                if (distance < dotOuterRadius - EPSILON) hits.add(obstacle);
                else if (distance < dotOuterRadius + clearance)
                  near.add(obstacle);
              }
            }
          }
        }
      }
      return [
        outsideFrame,
        hits.size,
        crossings.size,
        Math.max(0, path.length - 2),
        [...near].filter((obstacle) => !hits.has(obstacle)).length,
        length,
      ];
    };
    // Additive graph costs only guide the bounded search. Final candidates are
    // always compared by their whole-route quality, including deduplicated hits.
    const cost = (path: Point[]) => {
      const q = quality(path);
      return (
        q[0] * 100000 + q[1] * 2500 + q[2] * 140 + q[3] * 40 + q[4] * 6 + q[5]
      );
    };
    let best: Route | undefined;
    const accept = (points: Point[], source: Pin, target: Pin) => {
      const path = simplify(points);
      if (
        path.length < 2 ||
        direction(path[0], path[1]) !== source.direction ||
        direction(path.at(-1)!, path.at(-2)!) !== target.direction ||
        !legal(path, mask)
      )
        return;
      const q = quality(path);
      q[5] += source.hiddenLength + target.hiddenLength;
      if (!best || compareQuality(q, best.quality) < 0)
        best = { path, source, target, quality: q };
    };
    const old = routes.get(label.id);
    if (old) accept(old.path, old.source, old.target);
    for (const source of sources)
      for (const target of targets) {
        // A direct five-pixel gap must not require two five-pixel leads.
        for (const path of initialPaths(source.point, target.point))
          accept(path, source, target);
        for (const path of initialPaths(source.lead, target.lead))
          accept([source.point, ...path, target.point], source, target);
      }

    if (!best) {
      // One perimeter model handles all degenerate/overlapping marker cases.
      // Try the frame first, then an unbounded outer channel if it cannot fit.
      const all = [...sources, ...targets].flatMap((p) => [p.point, p.lead]);
      const outer = {
        x: Math.min(...all.map((p) => p.x)) - 2 * minVisibleLength,
        y: Math.min(...all.map((p) => p.y)) - 2 * minVisibleLength,
        width: 0,
        height: 0,
      };
      outer.width =
        Math.max(...all.map((p) => p.x)) + 2 * minVisibleLength - outer.x;
      outer.height =
        Math.max(...all.map((p) => p.y)) + 2 * minVisibleLength - outer.y;
      for (const board of [...(frame ? [frame] : []), outer]) {
        const left = board.x;
        const right = left + board.width;
        const top = board.y;
        const bottom = top + board.height;
        const corners = [
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
          { x: left, y: top },
        ];
        const boundary = (pin: Pin) => ({
          x: pin.side === 1 ? right : pin.side === 3 ? left : pin.point.x,
          y: pin.side === 0 ? top : pin.side === 2 ? bottom : pin.point.y,
        });
        for (const source of sources.filter((p) => p.direction % 2 === 0))
          for (const target of targets.filter((p) => p.direction % 2 === 0)) {
            const exit = boundary(source);
            const entry = boundary(target);
            if (source.side === target.side)
              accept([source.point, exit, entry, target.point], source, target);
            for (const step of [-1, 1]) {
              const turns =
                (step > 0
                  ? target.side - source.side + 4
                  : source.side - target.side + 4) % 4;
              const channel = Array.from(
                { length: turns || 4 },
                (_, i) =>
                  corners[(source.side + (step > 0 ? i : -i - 1) + 8) % 4],
              );
              accept(
                [source.point, exit, ...channel, entry, target.point],
                source,
                target,
              );
            }
          }
      }
    }
    if (!best)
      throw new Error(`Unable to route visible connector for ${label.id}`);

    if (searchBudget > 0 && hasConflict(best.quality)) {
      searchBudget--;
      const selectedSources = [
        best.source,
        ...sources
          .filter((p) => p !== best!.source)
          .sort(
            (a, b) =>
              Math.hypot(
                a.lead.x - best!.target.lead.x,
                a.lead.y - best!.target.lead.y,
              ) -
              Math.hypot(
                b.lead.x - best!.target.lead.x,
                b.lead.y - best!.target.lead.y,
              ),
          ),
      ].slice(0, 3);
      const selectedTargets = [
        best.target,
        ...targets
          .filter((p) => p !== best!.target)
          .sort(
            (a, b) =>
              Math.hypot(
                a.lead.x - best!.source.lead.x,
                a.lead.y - best!.source.lead.y,
              ) -
              Math.hypot(
                b.lead.x - best!.source.lead.x,
                b.lead.y - best!.source.lead.y,
              ),
          ),
      ].slice(0, 3);
      const nodes = [
        ...selectedSources.map((p) => p.lead),
        ...selectedTargets.map((p) => p.lead),
      ];
      const nearby = obstacles
        .filter(({ item }) => item.id !== label.id)
        .map(({ item, box }) => ({
          box,
          distance:
            distanceToSegment(
              { x: item.x + item.width / 2, y: item.y + item.height / 2 },
              mask.source,
              best!.target.point,
            ) -
            Math.max(item.width, item.height) / 2,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4);
      for (const { box } of nearby)
        for (const x of [box.x - 1, box.x + box.width + 1])
          for (const y of [box.y - 1, box.y + box.height + 1])
            if (
              !frame ||
              (x >= frame.x &&
                y >= frame.y &&
                x <= frame.x + frame.width &&
                y <= frame.y + frame.height)
            )
              nodes.push({ x, y });
      type Edge = {
        to: number;
        path: Point[];
        cost: number;
        first: number;
        last: number;
      };
      const graph = nodes.map(() => [] as Edge[]);
      for (let i = 0; i < nodes.length; i++)
        for (let j = 0; j < nodes.length; j++)
          if (i !== j)
            for (const path of initialPaths(nodes[i], nodes[j]))
              if (legal(path, mask)) {
                graph[i].push({
                  to: j,
                  path,
                  cost: cost(path),
                  first: direction(path[0], path[1]),
                  last: direction(path.at(-2)!, path.at(-1)!),
                });
              }
      const distances = Array<number>(nodes.length * 8).fill(
        Number.POSITIVE_INFINITY,
      );
      const visited = new Uint8Array(distances.length);
      const parents = Array<{ from: number; edge: Edge } | undefined>(
        distances.length,
      );
      selectedSources.forEach((pin, i) => {
        distances[i * 8 + pin.direction] =
          pin.hiddenLength + cost([pin.point, pin.lead]);
      });
      for (let iteration = 0; iteration < distances.length; iteration++) {
        let current = -1;
        for (let i = 0; i < distances.length; i++)
          if (!visited[i] && (current < 0 || distances[i] < distances[current]))
            current = i;
        if (current < 0 || !Number.isFinite(distances[current])) break;
        visited[current] = 1;
        const node = Math.floor(current / 8);
        const incoming = current % 8;
        const target = selectedTargets[node - selectedSources.length];
        if (
          target &&
          Number.isFinite(turnCost(incoming, (target.direction + 4) % 8))
        ) {
          const chunks: Point[][] = [];
          let root = current;
          while (parents[root]) {
            const parent = parents[root]!;
            chunks.push(parent.edge.path.slice(1));
            root = parent.from;
          }
          const source = selectedSources[Math.floor(root / 8)];
          accept(
            [
              source.point,
              source.lead,
              ...chunks.reverse().flat(),
              target.point,
            ],
            source,
            target,
          );
        }
        for (const edge of graph[node]) {
          const value =
            distances[current] + edge.cost + turnCost(incoming, edge.first);
          const next = edge.to * 8 + edge.last;
          if (value < distances[next]) {
            distances[next] = value;
            parents[next] = { from: current, edge };
          }
        }
      }
    }
    routes.set(label.id, best);
    for (const [a, b] of segments(best.path))
      index.add(segmentBounds(a, b), {
        kind: 'wire',
        id: label.id,
        path: best.path,
        a,
        b,
      });
    return best.quality;
  };
  const priorities = ordered.map((label) => ({ label, quality: route(label) }));
  if (labels.length <= 48)
    for (const { label, quality } of priorities
      .sort((a, b) => compareQuality(b.quality, a.quality))
      .slice(0, 4))
      if (hasConflict(quality)) route(label);
  return new Map([...routes].map(([id, r]) => [id, r.path]));
}
