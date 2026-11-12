import {
  dotRadius,
  markerStrokeWidth,
  minVisibleLength,
} from './scatterGeometry';

const connectionGap = minVisibleLength + dotRadius + markerStrokeWidth;
const sourceLead = dotRadius + markerStrokeWidth / 2 + minVisibleLength;

export type LabelInput = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orderX: number;
  orderY: number;
};
type Bounds = { x: number; y: number; width: number; height: number };
export type LabelPlacement = Bounds & { id: string };
type Edge = { from: number; to: number; gap: number };
type Axis = {
  rank: number[];
  index: number[];
  targets: number[];
  offsets: number[];
  values: number[];
  edges: Edge[];
  low: number[];
  high: number[];
};
type Conflict = { i: number; j: number; point: boolean; overlap: number };

// Prefer center-port alignments that admit a straight or two-segment H/V
// connector. The router still validates the complete visible geometry.
function connectionComplexity(input: LabelInput, x: number, y: number) {
  const dx = Math.abs(x - input.x);
  const dy = Math.abs(y - input.y);
  if (
    (dx < 1e-7 && dy >= input.height / 2 + connectionGap - 1e-7) ||
    (dy < 1e-7 && dx >= input.width / 2 + connectionGap - 1e-7)
  )
    return 0;
  if (
    (dx >= sourceLead - 1e-7 &&
      dy >=
        input.height / 2 + markerStrokeWidth / 2 + minVisibleLength - 1e-7) ||
    (dy >= sourceLead - 1e-7 &&
      dx >= input.width / 2 + markerStrokeWidth / 2 + minVisibleLength - 1e-7)
  )
    return 1;
  return 2;
}

// Rank chains and the selected clearances form a DAG. Forward/backward passes
// produce feasible coordinates; averaging the two passes keeps movement shared.
function solve(axis: Axis): number[] | undefined {
  const { rank, targets, edges } = axis;
  // Solve X as the left edge and Y as the center; collision geometry stays center-based.
  // Equal data values share one anchor variable. A zero minimum gap alone would let
  // avoidance split tied models into separate rows or columns.
  const group: number[] = [];
  const low: number[] = [];
  const high: number[] = [];
  const sums: number[] = [];
  const counts: number[] = [];
  for (let r = 0; r < rank.length; r++) {
    const g =
      r && axis.values[rank[r]] === axis.values[rank[r - 1]]
        ? group[r - 1]
        : counts.length;
    group[r] = g;
    const offset = axis.offsets[rank[r]];
    low[g] = Math.max(low[g] ?? Number.NEGATIVE_INFINITY, axis.low[r] - offset);
    high[g] = Math.min(
      high[g] ?? Number.POSITIVE_INFINITY,
      axis.high[r] - offset,
    );
    sums[g] = (sums[g] ?? 0) + targets[rank[r]] - offset;
    counts[g] = (counts[g] ?? 0) + 1;
  }
  const incoming = counts.map(() => [] as Edge[]);
  const outgoing = counts.map(() => [] as Edge[]);
  for (const edge of edges) {
    const from = group[edge.from];
    const to = group[edge.to];
    const gap =
      edge.gap + axis.offsets[rank[edge.from]] - axis.offsets[rank[edge.to]];
    if (from === to) {
      if (gap > 1e-7) return undefined;
      continue;
    }
    const constraint = { from, to, gap };
    incoming[to].push(constraint);
    outgoing[from].push(constraint);
  }
  for (let i = 0; i < counts.length; i++) {
    for (const e of incoming[i]) low[i] = Math.max(low[i], low[e.from] + e.gap);
    if (low[i] > high[i]) return undefined;
  }
  for (let i = counts.length - 1; i >= 0; i--) {
    for (const e of outgoing[i])
      high[i] = Math.min(high[i], high[e.to] - e.gap);
    if (low[i] > high[i]) return undefined;
  }
  const left = Array<number>(counts.length);
  const right = Array<number>(counts.length);
  for (let i = 0; i < counts.length; i++) {
    const minimum = incoming[i].reduce(
      (v, e) => Math.max(v, left[e.from] + e.gap),
      low[i],
    );
    left[i] = Math.max(minimum, Math.min(high[i], sums[i] / counts[i]));
  }
  for (let i = counts.length - 1; i >= 0; i--) {
    const maximum = outgoing[i].reduce(
      (v, e) => Math.min(v, right[e.to] - e.gap),
      high[i],
    );
    right[i] = Math.min(maximum, Math.max(low[i], sums[i] / counts[i]));
  }
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < counts.length; i++) {
    const d = right[i] - left[i];
    numerator += (sums[i] - counts[i] * left[i]) * d;
    denominator += counts[i] * d * d;
  }
  const weight = denominator
    ? Math.max(0, Math.min(1, numerator / denominator))
    : 0;
  const result = Array<number>(rank.length);
  for (let r = 0; r < rank.length; r++) {
    const g = group[r];
    result[rank[r]] =
      left[g] + weight * (right[g] - left[g]) + axis.offsets[rank[r]];
  }
  return result;
}

function conflicts(inputs: LabelInput[], x: number[], y: number[]) {
  const result: Conflict[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const a = inputs[i];
    for (let j = 0; j < inputs.length; j++) {
      const gap = i === j ? connectionGap : 7;
      const dx = a.width / 2 + gap - Math.abs(x[i] - inputs[j].x);
      const dy = a.height / 2 + gap - Math.abs(y[i] - inputs[j].y);
      if (dx > 0.01 && dy > 0.01)
        result.push({ i, j, point: true, overlap: Math.min(dx, dy) });
    }
    for (let j = i + 1; j < inputs.length; j++) {
      const dx = (a.width + inputs[j].width) / 2 + 7 - Math.abs(x[i] - x[j]);
      const dy = (a.height + inputs[j].height) / 2 + 7 - Math.abs(y[i] - y[j]);
      if (dx > 0.01 && dy > 0.01)
        result.push({ i, j, point: false, overlap: Math.min(dx, dy) });
    }
  }
  return result;
}

export function layoutScatterLabels(
  inputs: LabelInput[],
  bounds: Bounds,
  frameBounds?: Bounds,
): LabelPlacement[] {
  if (!inputs.length) return [];
  const rows = new Map<number, number[]>();
  const columns = new Map<number, number[]>();
  inputs.forEach((p, i) => {
    const row = rows.get(p.orderY) ?? [];
    row.push(i);
    rows.set(p.orderY, row);
    const column = columns.get(p.orderX) ?? [];
    column.push(i);
    columns.set(p.orderX, column);
  });
  const cost = (
    x: number[],
    y: number[],
    collisions = conflicts(inputs, x, y),
  ) => {
    let value = collisions.reduce((s, c) => s + 10000 + c.overlap * 80, 0);
    for (let i = 0; i < inputs.length; i++) {
      const a = inputs[i];
      // Short leaders matter even after every overlap is resolved. The plot
      // boundary is only a preference: labels may use surrounding whitespace.
      const dx = Math.max(0, Math.abs(x[i] - a.x) - a.width / 2);
      const dy = Math.max(0, Math.abs(y[i] - a.y) - a.height / 2);
      value +=
        dx * dx + dy * dy + 0.05 * ((x[i] - a.x) ** 2 + (y[i] - a.y) ** 2);
      const outsideX = Math.max(
        0,
        bounds.x - x[i],
        x[i] - bounds.x - bounds.width,
      );
      const outsideY = Math.max(
        0,
        bounds.y - y[i],
        y[i] - bounds.y - bounds.height,
      );
      value += 0.03 * (outsideX ** 2 + outsideY ** 2);
    }
    return value;
  };
  const makeAxis = (
    key: 'orderX' | 'orderY',
    targets: number[],
    compareTies: (a: number, b: number) => number,
  ): Axis => {
    const dimension = key === 'orderX' ? 'width' : 'height';
    const offsets = inputs.map((p) => (key === 'orderX' ? p.width / 2 : 0));
    const start = frameBounds?.[key === 'orderX' ? 'x' : 'y'] ?? 0;
    const end = start + (frameBounds?.[dimension] ?? 0);
    const rank = inputs
      .map((_, i) => i)
      .sort(
        (a, b) =>
          inputs[a][key] - inputs[b][key] ||
          compareTies(a, b) ||
          inputs[a].id.localeCompare(inputs[b].id),
      );
    const index = Array<number>(inputs.length);
    rank.forEach((i, r) => {
      index[i] = r;
    });
    return {
      rank,
      index,
      values: inputs.map((p) => p[key]),
      targets,
      offsets,
      // Rank edges use center coordinates, like the other separation constraints.
      edges: rank.slice(1).map((i, r) => ({
        from: r,
        to: r + 1,
        gap:
          (inputs[i][key] === inputs[rank[r]][key] ? 0 : 0.25) +
          offsets[i] -
          offsets[rank[r]],
      })),
      // Reserve the capsule hover growth at the frame edges without moving it on hover.
      low: rank.map((i) =>
        frameBounds
          ? start +
            inputs[i][dimension] / 2 +
            (key === 'orderX'
              ? 2
              : Math.max(6, inputs[i][dimension] * 0.06 + 2))
          : Number.NEGATIVE_INFINITY,
      ),
      high: rank.map((i) =>
        frameBounds
          ? end -
            inputs[i][dimension] / 2 -
            Math.max(
              6,
              inputs[i][dimension] * (key === 'orderX' ? 0.12 : 0.06) + 2,
            )
          : Number.POSITIVE_INFINITY,
      ),
    };
  };
  const run = (alternate: boolean, direction: number) => {
    const axis = (key: 'orderX' | 'orderY') => {
      const other = key === 'orderX' ? 'orderY' : 'orderX';
      return makeAxis(
        key,
        inputs.map((p) =>
          key === 'orderX'
            ? p.x +
              (direction >= 2
                ? (direction === 2 ? 1 : -1) * (p.width / 2 + 14)
                : 0)
            : p.y +
              (direction < 2
                ? (direction === 0 ? 1 : -1) * (p.height / 2 + 14)
                : 0),
        ),
        (a, b) =>
          alternate
            ? inputs[b][other] - inputs[a][other]
            : inputs[a][other] - inputs[b][other],
      );
    };
    let ax = axis('orderX');
    let ay = axis('orderY');
    // Equal pass rates share a row: reserve horizontal room where it fits.
    for (const row of rows.values()) {
      const ordered = [...row].sort(
        (a, b) =>
          inputs[a].orderX - inputs[b].orderX ||
          inputs[a].width - inputs[b].width,
      );
      const edges = ordered.slice(1).flatMap((i, r) => {
        const before = ordered[r];
        return inputs[i].orderX === inputs[before].orderX
          ? []
          : [
              {
                from: ax.index[before],
                to: ax.index[i],
                gap: (inputs[before].width + inputs[i].width) / 2 + 7.1,
              },
            ];
      });
      if (!edges.length) continue;
      const candidate = { ...ax, edges: [...ax.edges, ...edges] };
      if (solve(candidate)) ax = candidate;
    }
    // Equal elapsed times share a column: reserve vertical room where it fits.
    for (const column of columns.values()) {
      const ordered = [...column].sort(
        (a, b) =>
          inputs[a].orderY - inputs[b].orderY ||
          inputs[a].height - inputs[b].height,
      );
      const edges = ordered.slice(1).flatMap((i, r) => {
        const before = ordered[r];
        return inputs[i].orderY === inputs[before].orderY
          ? []
          : [
              {
                from: ay.index[before],
                to: ay.index[i],
                gap: (inputs[before].height + inputs[i].height) / 2 + 7.1,
              },
            ];
      });
      if (!edges.length) continue;
      const candidate = { ...ay, edges: [...ay.edges, ...edges] };
      if (solve(candidate)) ay = candidate;
    }
    let x = solve(ax);
    let y = solve(ay);
    if (!x || !y) return undefined;
    let bestLayout = { x, y, cost: cost(x, y) };
    const budget =
      inputs.length <= 40 ? 2200 : inputs.length <= 100 ? 320 : 120;
    let trials = 0;
    for (
      let step = 0;
      step < Math.min(inputs.length * 3, 120) && trials < budget;
      step++
    ) {
      const overlap = conflicts(inputs, x, y).sort(
        (a, b) =>
          b.overlap - a.overlap ||
          Number(b.point) - Number(a.point) ||
          a.i - b.i ||
          a.j - b.j,
      );
      if (!overlap.length) break;
      let best:
        | { axis: Axis; x: boolean; coordinates: number[]; cost: number }
        | undefined;
      for (const c of overlap.slice(0, inputs.length <= 40 ? 8 : 3)) {
        for (const horizontal of [false, true]) {
          const source = horizontal ? ax : ay;
          const i = source.index[c.i];
          const j = source.index[c.j];
          const dimension = horizontal ? 'width' : 'height';
          const gap = c.point
            ? inputs[c.i][dimension] / 2 +
              (c.i === c.j ? connectionGap + 0.1 : 7.1)
            : (inputs[c.i][dimension] + inputs[c.j][dimension]) / 2 + 7.1;
          const variants: Axis[] = [];
          if (c.point) {
            const dot = horizontal ? inputs[c.j].x : inputs[c.j].y;
            const low = [...source.low];
            low[i] = Math.max(low[i], dot + gap);
            const high = [...source.high];
            high[i] = Math.min(high[i], dot - gap);
            variants.push({ ...source, low }, { ...source, high });
          } else
            variants.push({
              ...source,
              edges: [
                ...source.edges,
                { from: Math.min(i, j), to: Math.max(i, j), gap },
              ],
            });
          for (const candidate of variants) {
            if (++trials > budget) break;
            const coordinates = solve(candidate);
            if (!coordinates) continue;
            const value = horizontal
              ? cost(coordinates, y)
              : cost(x, coordinates);
            if (value < (best?.cost ?? Number.POSITIVE_INFINITY) - 0.01)
              best = {
                axis: candidate,
                x: horizontal,
                coordinates,
                cost: value,
              };
          }
        }
      }
      if (!best) break;
      if (best.x) {
        ax = best.axis;
        x = best.coordinates;
      } else {
        ay = best.axis;
        y = best.coordinates;
      }
      if (best.cost < bestLayout.cost) bestLayout = { x, y, cost: best.cost };
    }
    return bestLayout;
  };
  const candidates = [run(false, 0)];
  if (inputs.length <= 60)
    for (const direction of [0, 1, 2, 3]) {
      if (direction) candidates.push(run(false, direction));
      candidates.push(run(true, direction));
    }
  const feasible = candidates.filter((candidate) => candidate !== undefined);
  if (!feasible.length) {
    if (frameBounds) {
      const width = Math.max(...inputs.map((p) => p.width));
      const height = Math.max(...inputs.map((p) => p.height));
      return layoutScatterLabels(inputs, bounds, {
        ...frameBounds,
        width: Math.max(
          frameBounds.width,
          width +
            2 +
            Math.max(6, width * 0.12 + 2) +
            new Set(inputs.map((p) => p.orderX)).size * 0.25 +
            1,
        ),
        height: Math.max(
          frameBounds.height,
          height +
            2 * Math.max(6, height * 0.06 + 2) +
            new Set(inputs.map((p) => p.orderY)).size * 0.25 +
            1,
        ),
      });
    }
    throw new Error('Unable to preserve scatter label ordering');
  }
  let best = feasible.reduce((a, b) => (b.cost < a.cost ? b : a));
  // Legalize residual pad/label conflicts while preserving the separations
  // already achieved between labels. Rebuild from the current placement so
  // early choices of which side to pass a dot do not permanently trap it.
  if (inputs.length <= 100) {
    const ax = makeAxis('orderX', best.x, (a, b) => best.x[a] - best.x[b]);
    const ay = makeAxis('orderY', best.y, (a, b) => best.y[a] - best.y[b]);
    for (let i = 0; i < inputs.length; i++)
      for (let j = i + 1; j < inputs.length; j++) {
        const gx = (inputs[i].width + inputs[j].width) / 2 + 7;
        const gy = (inputs[i].height + inputs[j].height) / 2 + 7;
        const dx = Math.abs(best.x[i] - best.x[j]);
        const dy = Math.abs(best.y[i] - best.y[j]);
        const horizontal = dx >= gx && (dy < gy || dx / gx > dy / gy);
        if (!horizontal && dy < gy) continue;
        const axis = horizontal ? ax : ay;
        const a = axis.index[i];
        const b = axis.index[j];
        axis.edges.push({
          from: Math.min(a, b),
          to: Math.max(a, b),
          gap: horizontal ? gx : gy,
        });
      }
    type LegalState = typeof best & { ax: Axis; ay: Axis; count: number };
    let beam: LegalState[] = [
      {
        ...best,
        ax,
        ay,
        count: conflicts(inputs, best.x, best.y).length,
      },
    ];
    let legal: LegalState | undefined;
    for (let pass = 0; pass < 20 && beam.length; pass++) {
      const next: LegalState[] = [];
      for (const state of beam) {
        const collisions = conflicts(inputs, state.x, state.y);
        if (!collisions.length) {
          if (!legal || state.cost < legal.cost) legal = state;
          continue;
        }
        for (const c of collisions.slice(0, 2))
          for (const horizontal of [false, true])
            for (const side of [-1, 1]) {
              const source = horizontal ? state.ax : state.ay;
              const i = source.index[c.i];
              const candidate = { ...source };
              if (c.point) {
                const gap =
                  inputs[c.i][horizontal ? 'width' : 'height'] / 2 +
                  (c.i === c.j ? connectionGap + 0.1 : 7.1);
                const dot = inputs[c.j][horizontal ? 'x' : 'y'];
                candidate.low = [...source.low];
                candidate.high = [...source.high];
                if (side < 0)
                  candidate.high[i] = Math.min(candidate.high[i], dot - gap);
                else candidate.low[i] = Math.max(candidate.low[i], dot + gap);
              } else {
                if (side > 0) continue;
                const j = source.index[c.j];
                candidate.edges = [
                  ...source.edges,
                  {
                    from: Math.min(i, j),
                    to: Math.max(i, j),
                    gap:
                      (inputs[c.i][horizontal ? 'width' : 'height'] +
                        inputs[c.j][horizontal ? 'width' : 'height']) /
                        2 +
                      7.1,
                  },
                ];
              }
              const coordinates = solve(candidate);
              if (!coordinates) continue;
              const x = horizontal ? coordinates : state.x;
              const y = horizontal ? state.y : coordinates;
              const collisions = conflicts(inputs, x, y);
              next.push({
                x,
                y,
                cost: cost(x, y, collisions),
                ax: horizontal ? candidate : state.ax,
                ay: horizontal ? state.ay : candidate,
                count: collisions.length,
              });
            }
      }
      next.sort(
        (a, b) => a.count * 100000 + a.cost - b.count * 100000 - b.cost,
      );
      beam = next.slice(0, 4);
      if (legal) break;
    }
    const finished = [...beam, ...(legal ? [legal] : [])].sort(
      (a, b) => a.count * 100000 + a.cost - b.count * 100000 - b.cost,
    )[0];
    if (finished && finished.count < conflicts(inputs, best.x, best.y).length)
      best = finished;
  }
  // Use upper whitespace without introducing or worsening any collision.
  // Tied values move as one row, so alignment and both axis orders stay intact.
  let previousRow = Number.NEGATIVE_INFINITY;
  for (const [, row] of [...rows].sort(([a], [b]) => a - b)) {
    const members = new Set(row);
    const minimum = Math.max(
      previousRow + 0.25,
      ...row.map((i) =>
        frameBounds
          ? frameBounds.y +
            inputs[i].height / 2 +
            Math.max(3, inputs[i].height * 0.06 + 2)
          : Number.NEGATIVE_INFINITY,
      ),
    );
    const limit = Math.min(28, best.y[row[0]] - minimum);
    for (let shift = limit; shift > 0.01; shift -= 1) {
      const clear = row.every(
        (i) =>
          connectionComplexity(inputs[i], best.x[i], best.y[i] - shift) <=
            connectionComplexity(inputs[i], best.x[i], best.y[i]) &&
          inputs.every((dot, j) => {
            const a = inputs[i];
            const pointGap = i === j ? connectionGap : 7;
            if (Math.abs(best.x[i] - dot.x) < a.width / 2 + pointGap) {
              const gap = a.height / 2 + pointGap;
              const before = gap - Math.abs(best.y[i] - dot.y);
              const after = gap - Math.abs(best.y[i] - shift - dot.y);
              if (after > Math.max(0, before) + 1e-7) return false;
            }
            if (
              !members.has(j) &&
              Math.abs(best.x[i] - best.x[j]) < (a.width + dot.width) / 2 + 7
            ) {
              const gap = (a.height + dot.height) / 2 + 7;
              const before = gap - Math.abs(best.y[i] - best.y[j]);
              const after = gap - Math.abs(best.y[i] - shift - best.y[j]);
              if (after > Math.max(0, before) + 1e-7) return false;
            }
            return true;
          }),
      );
      if (clear) {
        for (const i of row) best.y[i] -= shift;
        break;
      }
    }
    previousRow = best.y[row[0]];
  }
  // Align tied groups together. Each move stays between neighboring rank
  // anchors and preserves all existing point/label clearances.
  const pointOverlap = (i: number, j: number, x: number, y: number) => {
    const gap = i === j ? connectionGap : 7;
    return Math.max(
      0,
      Math.min(
        inputs[i].width / 2 + gap - Math.abs(x - inputs[j].x),
        inputs[i].height / 2 + gap - Math.abs(y - inputs[j].y),
      ),
    );
  };
  const labelOverlap = (
    i: number,
    j: number,
    x: number,
    y: number,
    otherX = best.x[j],
    otherY = best.y[j],
  ) =>
    Math.max(
      0,
      Math.min(
        (inputs[i].width + inputs[j].width) / 2 + 7 - Math.abs(x - otherX),
        (inputs[i].height + inputs[j].height) / 2 + 7 - Math.abs(y - otherY),
      ),
    );
  for (let pass = 0; pass < (inputs.length <= 100 ? 2 : 1); pass++)
    for (const horizontal of [true, false]) {
      const groups = [...(horizontal ? columns : rows)]
        .sort(([a], [b]) => a - b)
        .map(([, members]) => members);
      const anchor = (i: number) =>
        horizontal ? best.x[i] - inputs[i].width / 2 : best.y[i];
      const limits = groups.map((members) => ({
        low: Math.max(
          ...members.map((i) =>
            frameBounds
              ? horizontal
                ? frameBounds.x + 2
                : frameBounds.y +
                  inputs[i].height / 2 +
                  Math.max(6, inputs[i].height * 0.06 + 2)
              : Number.NEGATIVE_INFINITY,
          ),
        ),
        high: Math.min(
          ...members.map((i) =>
            frameBounds
              ? horizontal
                ? frameBounds.x +
                  frameBounds.width -
                  inputs[i].width -
                  Math.max(6, inputs[i].width * 0.12 + 2)
                : frameBounds.y +
                  frameBounds.height -
                  inputs[i].height / 2 -
                  Math.max(6, inputs[i].height * 0.06 + 2)
              : Number.POSITIVE_INFINITY,
          ),
        ),
      }));
      const groupIndex = Array<number>(inputs.length);
      groups.forEach((members, g) =>
        members.forEach((i) => {
          groupIndex[i] = g;
        }),
      );
      const outgoing = groups.map(() => new Map<number, number>());
      for (let g = 0; g + 1 < groups.length; g++) outgoing[g].set(g + 1, 0.25);
      // Keep existing capsule separations as edges in the same rank DAG, so a
      // pushed label can make room by moving its neighbors instead of colliding.
      for (let i = 0; i < inputs.length; i++)
        for (let j = i + 1; j < inputs.length; j++) {
          if (groupIndex[i] === groupIndex[j]) continue;
          const a = groupIndex[i] < groupIndex[j] ? i : j;
          const b = a === i ? j : i;
          const perpendicular = horizontal
            ? Math.abs(best.y[a] - best.y[b])
            : Math.abs(best.x[a] - best.x[b]);
          const across =
            (inputs[a][horizontal ? 'height' : 'width'] +
              inputs[b][horizontal ? 'height' : 'width']) /
              2 +
            7;
          if (perpendicular >= across) continue;
          const gap = horizontal
            ? inputs[a].width + 7
            : (inputs[a].height + inputs[b].height) / 2 + 7;
          const available = anchor(b) - anchor(a);
          if (available < gap - 1e-7) continue;
          const from = groupIndex[a];
          const to = groupIndex[b];
          outgoing[from].set(
            to,
            Math.max(
              outgoing[from].get(to) ?? 0,
              Math.min(available, gap + 0.1),
            ),
          );
        }
      const incoming = groups.map(() => new Map<number, number>());
      outgoing.forEach((edges, from) => {
        for (const [to, gap] of edges) incoming[to].set(from, gap);
      });
      const preserves = (g: number, value: number) =>
        value >= limits[g].low - 1e-7 &&
        value <= limits[g].high + 1e-7 &&
        groups[g].every((i) => {
          const x = horizontal ? value + inputs[i].width / 2 : best.x[i];
          const y = horizontal ? best.y[i] : value;
          return (
            connectionComplexity(inputs[i], x, y) <=
              connectionComplexity(inputs[i], best.x[i], best.y[i]) &&
            inputs.every(
              (_, j) =>
                pointOverlap(i, j, x, y) <=
                pointOverlap(i, j, best.x[i], best.y[i]) + 1e-7,
            )
          );
        });
      const preservingAnchor = (
        g: number,
        requested: number,
        direction: number,
      ) => {
        if (preserves(g, requested)) return requested;
        return [
          ...new Set(
            groups[g].flatMap((i) => {
              const base = horizontal
                ? inputs[i].x - inputs[i].width / 2
                : inputs[i].y;
              const half = inputs[i][horizontal ? 'width' : 'height'] / 2;
              const ports = [
                0,
                sourceLead + 0.1,
                half + markerStrokeWidth / 2 + minVisibleLength + 0.1,
                half + connectionGap + 0.1,
              ].flatMap((offset) => [base - offset, base + offset]);
              const pads = inputs.flatMap((dot, j) => {
                const gap = i === j ? connectionGap : 7;
                const distance = horizontal
                  ? Math.abs(best.y[i] - dot.y)
                  : Math.abs(best.x[i] - dot.x);
                const otherHalf =
                  inputs[i][horizontal ? 'height' : 'width'] / 2;
                if (distance >= otherHalf + gap) return [];
                return horizontal
                  ? [dot.x - inputs[i].width - gap - 0.1, dot.x + gap + 0.1]
                  : [dot.y - half - gap - 0.1, dot.y + half + gap + 0.1];
              });
              return [...ports, ...pads];
            }),
          ),
        ]
          .filter((value) => (value - requested) * direction >= -1e-7)
          .sort((a, b) => (a - b) * direction)
          .find((value) => preserves(g, value));
      };
      for (let g = 0; g < groups.length; g++) {
        const anchors = groups.map((members) => anchor(members[0]));
        const current = anchors[g];
        const targets = [
          ...new Set(
            groups[g].flatMap((i) => {
              const value = horizontal
                ? inputs[i].x - inputs[i].width / 2
                : inputs[i].y;
              return [
                value,
                value - sourceLead - 0.1,
                value + sourceLead + 0.1,
              ].map((target) =>
                Math.max(limits[g].low, Math.min(limits[g].high, target)),
              );
            }),
          ),
        ]
          .sort((a, b) => Math.abs(a - current) - Math.abs(b - current))
          .slice(0, 8);
        let accepted:
          | {
              coordinates: { i: number; x: number; y: number }[];
              complexity: number;
              distance: number;
            }
          | undefined;
        for (const target of targets) {
          if (Math.abs(target - current) < 1e-7) continue;
          if (!preserves(g, target)) continue;
          const shifted = [...anchors];
          shifted[g] = target;
          const changed = new Set([g]);
          let feasible = true;
          const direction = target > current ? 1 : -1;
          for (
            let j = g;
            j >= 0 && j < groups.length && feasible;
            j += direction
          ) {
            if (!changed.has(j)) continue;
            for (const [neighbor, gap] of direction > 0
              ? outgoing[j]
              : incoming[j]) {
              const requested = shifted[j] + direction * gap;
              if ((shifted[neighbor] - requested) * direction >= -1e-7)
                continue;
              const next = preservingAnchor(neighbor, requested, direction);
              if (next === undefined) {
                feasible = false;
                break;
              }
              shifted[neighbor] = next;
              changed.add(neighbor);
              if (changed.size > 8) {
                feasible = false;
                break;
              }
            }
          }
          if (
            !feasible ||
            [...changed].some(
              (j) =>
                shifted[j] < limits[j].low - 1e-7 ||
                shifted[j] > limits[j].high + 1e-7,
            )
          )
            continue;
          const coordinates = [...changed].flatMap((g) =>
            groups[g].map((i) => ({
              i,
              x: best.x[i] + (horizontal ? shifted[g] - anchors[g] : 0),
              y: best.y[i] + (horizontal ? 0 : shifted[g] - anchors[g]),
            })),
          );
          const qualities = coordinates.map(
            ({ i, x, y }) =>
              connectionComplexity(inputs[i], x, y) -
              connectionComplexity(inputs[i], best.x[i], best.y[i]),
          );
          if (qualities.some((value) => value > 0)) continue;
          const complexity = qualities.reduce((sum, value) => sum + value, 0);
          const distance = coordinates.reduce(
            (sum, { i, x, y }) =>
              sum +
              (x - inputs[i].x) ** 2 +
              (y - inputs[i].y) ** 2 -
              (best.x[i] - inputs[i].x) ** 2 -
              (best.y[i] - inputs[i].y) ** 2,
            0,
          );
          if (
            complexity > (accepted?.complexity ?? 0) ||
            (complexity === (accepted?.complexity ?? 0) &&
              distance >= (accepted?.distance ?? 0) - 1e-7)
          )
            continue;
          const moved = new Map(coordinates.map((p) => [p.i, p]));
          if (
            !coordinates.every(({ i, x, y }) =>
              inputs.every(
                (_, j) =>
                  pointOverlap(i, j, x, y) <=
                    pointOverlap(i, j, best.x[i], best.y[i]) + 1e-7 &&
                  (i === j ||
                    labelOverlap(
                      i,
                      j,
                      x,
                      y,
                      moved.get(j)?.x ?? best.x[j],
                      moved.get(j)?.y ?? best.y[j],
                    ) <=
                      labelOverlap(i, j, best.x[i], best.y[i]) + 1e-7),
              ),
            )
          )
            continue;
          accepted = { coordinates, complexity, distance };
        }
        for (const { i, x, y } of accepted?.coordinates ?? []) {
          best.x[i] = x;
          best.y[i] = y;
        }
      }
    }
  return inputs.map((p, i) => ({
    id: p.id,
    x: best.x[i] - p.width / 2,
    y: best.y[i] - p.height / 2,
    width: p.width,
    height: p.height,
  }));
}
