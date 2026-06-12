import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GraphNode,
  NODE_W,
  buildGraphScene,
  computeCone,
} from '../model/graph';
import { type ModelIndices, plural, truncate } from '../model/indices';
/**
 * Flow graph view: React SVG rendering of the layered left→right scene from
 * model/graph.ts. Interactions: hover previews a dependency cone, click pins
 * it (re-styling in place so scroll is preserved), double-click jumps to
 * Stories, plus zoom (toolbar buttons / ctrl+wheel) and drag-panning.
 */
import type { ExploreModel } from '../model/types';

const KIND_NAMES = { feature: 'Feature', scenario: 'Scenario', flow: 'Flow' };

// SVG groups cannot be <button> elements; an explicit button role plus
// tabIndex is the only way to make graph nodes reachable for keyboards and
// assistive tech (spread so the a11y lint's semantic-element rule, which
// assumes HTML, does not misfire on SVG).
const SVG_BUTTON_PROPS = { role: 'button', tabIndex: 0 } as const;
const FADE_EDGE_THRESHOLD = 150;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

interface GraphViewProps {
  model: ExploreModel;
  indices: ModelIndices;
  onOpenInStories: (id: string) => void;
}

export const GraphView = memo(function GraphView({
  model,
  indices,
  onOpenInStories,
}: GraphViewProps) {
  const [everyScenario, setEveryScenario] = useState(true);
  const [fadeEdges, setFadeEdges] = useState(true);
  const [focusFlowId, setFocusFlowId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hotEdge, setHotEdge] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    panning: false,
    moved: false,
    lastX: 0,
    lastY: 0,
  });

  const scene = useMemo(
    () => buildGraphScene(model, indices, { everyScenario, focusFlowId }),
    [model, indices, everyScenario, focusFlowId],
  );

  // Drop a pin that no longer exists in the rebuilt scene.
  useEffect(() => {
    if (pinnedId && !scene.nodeById.has(pinnedId)) setPinnedId(null);
  }, [scene, pinnedId]);

  const coneRoot = pinnedId ?? hoverId;
  const cone = useMemo(
    () =>
      coneRoot && scene.nodeById.has(coneRoot)
        ? computeCone(coneRoot, scene.links)
        : null,
    [coneRoot, scene],
  );

  // Bring the pinned cone into view: scroll so the chain's top-left corner
  // is visible, letting the user read the highlighted path rightward.
  // When pinnedId is set, `cone` IS the pinned cone (pin wins over hover).
  useEffect(() => {
    if (!pinnedId || !cone) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (const node of scene.nodes) {
      if (!cone.nodes.has(node.id)) continue;
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
    }
    if (minX === Number.POSITIVE_INFINITY) return;
    scroller.scrollTo({
      left: Math.max(0, minX * zoom - 48),
      top: Math.max(0, minY * zoom - 72),
      behavior: 'smooth',
    });
  }, [pinnedId, cone, scene, zoom]);

  // Single zoom primitive: clamps, keeps the given client point (or the
  // viewport center) stationary, and accepts an absolute value or an
  // updater so the wheel handler can scale the current zoom.
  const zoomAt = useCallback(
    (
      next: number | ((current: number) => number),
      clientX?: number,
      clientY?: number,
    ) => {
      const scroller = scrollerRef.current;
      setZoom((current) => {
        const raw = typeof next === 'function' ? next(current) : next;
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw));
        if (!scroller || nextZoom === current) return nextZoom;
        const rect = scroller.getBoundingClientRect();
        const offsetX = (clientX ?? rect.left + rect.width / 2) - rect.left;
        const offsetY = (clientY ?? rect.top + rect.height / 2) - rect.top;
        const contentX = (scroller.scrollLeft + offsetX) / current;
        const contentY = (scroller.scrollTop + offsetY) / current;
        requestAnimationFrame(() => {
          scroller.scrollLeft = contentX * nextZoom - offsetX;
          scroller.scrollTop = contentY * nextZoom - offsetY;
        });
        return nextZoom;
      });
    },
    [],
  );

  // ctrl/cmd + wheel zooms toward the cursor (non-passive to preventDefault).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomAt(
        (current) => current * Math.exp(-event.deltaY * 0.0015),
        event.clientX,
        event.clientY,
      );
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const fitWidth = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scene.width === 0) return;
    zoomAt((scroller.clientWidth - 32) / scene.width);
  }, [scene.width, zoomAt]);

  const openNode = useCallback(
    (node: GraphNode) => {
      // Features open their first scenario.
      if (node.kind === 'feature') {
        const feature = indices.featureById.get(node.id);
        const first = feature?.scenarios[0];
        if (first) onOpenInStories(first.id);
        return;
      }
      onOpenInStories(node.id);
    },
    [indices, onOpenInStories],
  );

  const pinnedNode = pinnedId ? scene.nodeById.get(pinnedId) : undefined;
  const focusedFlow = focusFlowId ? indices.flowById.get(focusFlowId) : null;
  const faded = fadeEdges && scene.links.length > FADE_EDGE_THRESHOLD;

  // ———— pan-by-drag on the empty canvas ————
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('.gnode, .gedge-hit, button')) return;
    dragRef.current = {
      panning: true,
      moved: false,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.panning) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft -= dx;
      scroller.scrollTop -= dy;
    }
  };
  const onPointerUp = () => {
    dragRef.current.panning = false;
  };

  if (scene.nodes.length === 0) {
    return (
      <div className="graph-view">
        <div className="graph-toolbar">
          <b>No flows or flow calls to draw.</b>
        </div>
        <div className="graph-empty empty-state">
          <span className="empty-glyph" aria-hidden="true">
            ◇
          </span>
          <p>
            This suite has no flows yet — flows show up here as a call graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        {focusedFlow ? (
          <span className="toolbar-cluster">
            <span>Focused on</span>
            <b>{focusedFlow.name}</b>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setFocusFlowId(null);
                setPinnedId(null);
              }}
            >
              Clear focus
            </button>
          </span>
        ) : (
          <span className="toolbar-cluster">
            <label className="toggle">
              <input
                type="checkbox"
                checked={everyScenario}
                onChange={(event) => {
                  setEveryScenario(event.target.checked);
                  setPinnedId(null);
                }}
              />
              Show every scenario
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={fadeEdges}
                onChange={(event) => {
                  setFadeEdges(event.target.checked);
                  setPinnedId(null);
                }}
              />
              Fit edges (dim when dense)
            </label>
          </span>
        )}

        <span className="toolbar-stat">
          {plural(scene.nodes.length, 'node')} ·{' '}
          {plural(scene.links.length, 'edge')}
          {scene.hiddenNote ? ` · ${scene.hiddenNote}` : ''}
        </span>

        {pinnedNode ? (
          <span className="toolbar-cluster pinned-cluster">
            <span>Pinned:</span>
            <b title={pinnedNode.label}>{truncate(pinnedNode.label, 48)}</b>
            <button
              type="button"
              className="btn"
              onClick={() => openNode(pinnedNode)}
            >
              Open in Stories
            </button>
            {pinnedNode.kind === 'flow' && !focusedFlow && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFocusFlowId(pinnedNode.id);
                  setPinnedId(null);
                }}
              >
                Focus subgraph
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setPinnedId(null)}
            >
              Unpin
            </button>
          </span>
        ) : (
          <span className="toolbar-hint">
            Hover a node to preview its dependency cone; click to pin it.
            Double-click opens in Stories.
          </span>
        )}

        <span className="toolbar-cluster zoom-cluster">
          <button
            type="button"
            className="btn zoom-btn"
            onClick={() => zoomAt(zoom / 1.2)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="zoom-value"
            onClick={() => zoomAt(1)}
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="btn zoom-btn"
            onClick={() => zoomAt(zoom * 1.2)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" className="btn" onClick={fitWidth}>
            Fit
          </button>
        </span>
      </div>

      <div
        className="graph-scroll"
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative container; nodes carry their own labels */}
        <svg
          className={faded ? 'graph-svg fade-edges' : 'graph-svg'}
          width={scene.width * zoom}
          height={scene.height * zoom}
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          onClick={() => {
            if (dragRef.current.moved) {
              dragRef.current.moved = false;
              return;
            }
            if (pinnedId) setPinnedId(null);
          }}
        >
          {scene.bands.map((band) => (
            <g key={band.label}>
              <rect
                className="gband"
                x={band.x}
                y={band.y}
                width={band.width}
                height={band.height}
                rx={10}
              />
              <text className="gband-label" x={band.x + 12} y={band.y + 18}>
                {band.label}
              </text>
            </g>
          ))}

          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#5f6b80" />
            </marker>
          </defs>

          {scene.links.map((link, index) => {
            const inCone = cone ? cone.links.has(index) : false;
            const dim = cone ? !inCone : false;
            const hot = hotEdge === index;
            return (
              <g key={`${link.from}→${link.to}`}>
                <path
                  className={[
                    'gedge',
                    link.isFlowEdge ? 'flowedge' : '',
                    inCone ? 'cone' : '',
                    dim ? 'dim' : '',
                    hot ? 'hot' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  d={link.d}
                  markerEnd="url(#arrow)"
                >
                  <title>
                    {`${scene.nodeById.get(link.from)?.label ?? link.from}  →  ${
                      scene.nodeById.get(link.to)?.label ?? link.to
                    }\n${link.label}`}
                  </title>
                </path>
                {/* Invisible fat twin so the thin edge is easy to hover. */}
                <path
                  className="gedge-hit"
                  d={link.d}
                  onMouseEnter={() => setHotEdge(index)}
                  onMouseLeave={() =>
                    setHotEdge((value) => (value === index ? null : value))
                  }
                />
                {hot && (
                  <text
                    className="gedge-label"
                    x={link.labelX}
                    y={link.labelY}
                    textAnchor="middle"
                  >
                    {truncate(link.label, 48)}
                  </text>
                )}
              </g>
            );
          })}

          {scene.nodes.map((node) => {
            const inCone = cone ? cone.nodes.has(node.id) : false;
            const dim = cone ? !inCone : false;
            const hot =
              hotEdge !== null &&
              (scene.links[hotEdge]?.from === node.id ||
                scene.links[hotEdge]?.to === node.id);
            const classes = [
              'gnode',
              node.kind,
              node.focus ? 'focus' : '',
              node.unused ? 'unused' : '',
              inCone ? 'cone' : '',
              dim ? 'dim' : '',
              pinnedId === node.id ? 'pinned' : '',
              hot ? 'hot' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <g
                key={node.id}
                className={classes}
                transform={`translate(${node.x} ${node.y})`}
                {...SVG_BUTTON_PROPS}
                aria-label={`${KIND_NAMES[node.kind]}: ${node.label}${
                  node.sub ? ` — ${node.sub}` : ''
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (dragRef.current.moved) {
                    dragRef.current.moved = false;
                    return;
                  }
                  setPinnedId((current) =>
                    current === node.id ? null : node.id,
                  );
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  openNode(node);
                }}
                onMouseEnter={() => {
                  if (!pinnedId) setHoverId(node.id);
                }}
                onMouseLeave={() => {
                  setHoverId((value) => (value === node.id ? null : value));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setPinnedId((current) =>
                      current === node.id ? null : node.id,
                    );
                  }
                }}
              >
                <rect width={NODE_W} height={node.h} rx={node.small ? 7 : 9} />
                <text x={11} y={node.small ? 21 : 20}>
                  {truncate(node.label, 40)}
                </text>
                {!node.small && (
                  <text className="sub" x={11} y={37}>
                    {truncate(
                      (node.unused ? 'UNUSED · ' : '') + (node.sub || ''),
                      48,
                    )}
                  </text>
                )}
                <title>
                  {node.label +
                    (node.sub ? `\n${node.sub}` : '') +
                    (node.unused ? '\n(unused)' : '')}
                </title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});
