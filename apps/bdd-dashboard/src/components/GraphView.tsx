import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GraphLink,
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

/** Cone status of one element relative to the active dependency cone. */
type ConeState = 'cone' | 'dim' | 'none';

/**
 * One graph node. Memoized so cone hover/pin changes only re-render nodes
 * whose primitive props actually flipped; all interaction is handled by
 * delegated listeners on the parent <svg> via data-node-id, so this
 * component receives no callbacks at all.
 */
const GraphNodeItem = memo(function GraphNodeItem({
  node,
  coneState,
  isPinned,
  isHot,
}: {
  node: GraphNode;
  coneState: ConeState;
  isPinned: boolean;
  isHot: boolean;
}) {
  const classes = [
    'gnode',
    node.kind,
    node.focus ? 'focus' : '',
    node.unused ? 'unused' : '',
    coneState === 'none' ? '' : coneState,
    isPinned ? 'pinned' : '',
    isHot ? 'hot' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <g
      data-node-id={node.id}
      className={classes}
      transform={`translate(${node.x} ${node.y})`}
      {...SVG_BUTTON_PROPS}
      aria-label={`${KIND_NAMES[node.kind]}: ${node.label}${
        node.sub ? ` — ${node.sub}` : ''
      }`}
    >
      <rect width={NODE_W} height={node.h} rx={node.small ? 7 : 9} />
      <text x={11} y={node.small ? 21 : 20}>
        {truncate(node.label, 40)}
      </text>
      {!node.small && (
        <text className="sub" x={11} y={37}>
          {truncate((node.unused ? 'UNUSED · ' : '') + (node.sub || ''), 48)}
        </text>
      )}
      <title>
        {node.label +
          (node.sub ? `\n${node.sub}` : '') +
          (node.unused ? '\n(unused)' : '')}
      </title>
    </g>
  );
});

/**
 * One graph edge (visible path + invisible fat hover twin + hot label).
 * Memoized like GraphNodeItem; hover detection is delegated through
 * data-edge-index on the hit path.
 */
const GraphEdgeItem = memo(function GraphEdgeItem({
  link,
  index,
  tooltip,
  coneState,
  isHot,
}: {
  link: GraphLink;
  index: number;
  tooltip: string;
  coneState: ConeState;
  isHot: boolean;
}) {
  return (
    <g>
      <path
        className={[
          'gedge',
          link.isFlowEdge ? 'flowedge' : '',
          coneState === 'none' ? '' : coneState,
          isHot ? 'hot' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        d={link.d}
        markerEnd="url(#arrow)"
      >
        <title>{tooltip}</title>
      </path>
      {/* Invisible fat twin so the thin edge is easy to hover. */}
      <path className="gedge-hit" data-edge-index={index} d={link.d} />
      {isHot && (
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
});

/** Resolve the node id from a delegated event inside the svg. */
function nodeIdFromEvent(event: React.SyntheticEvent): string | null {
  return (
    (event.target as Element)
      .closest('[data-node-id]')
      ?.getAttribute('data-node-id') ?? null
  );
}

/** Resolve the hovered edge index from a delegated event, if any. */
function edgeIndexFromEvent(event: React.SyntheticEvent): number | null {
  const hit = (event.target as Element).closest('[data-edge-index]');
  return hit ? Number(hit.getAttribute('data-edge-index')) : null;
}

function coneStateOf(inCone: boolean | undefined): ConeState {
  // undefined = no active cone at all.
  if (inCone === undefined) return 'none';
  return inCone ? 'cone' : 'dim';
}

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
  const hotLink = hotEdge !== null ? scene.links[hotEdge] : undefined;

  // A pin suppresses the hover/focus preview; React's no-change bail-out
  // makes repeat calls with the same id free.
  const previewCone = (nodeId: string | null) => {
    setHoverId(pinnedId ? null : nodeId);
  };
  const togglePin = (nodeId: string) => {
    setPinnedId((current) => (current === nodeId ? null : nodeId));
  };

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
          // Node/edge interaction is delegated here (data-node-id /
          // data-edge-index) so the memoized children need no callbacks.
          // mouseover/focus only fire when crossing element boundaries, and
          // React bails out of no-change setState (Object.is), so movement
          // within one node never triggers a re-render.
          onClick={(event) => {
            if (dragRef.current.moved) {
              dragRef.current.moved = false;
              return;
            }
            const nodeId = nodeIdFromEvent(event);
            if (nodeId) togglePin(nodeId);
            else setPinnedId(null);
          }}
          onDoubleClick={(event) => {
            const nodeId = nodeIdFromEvent(event);
            const node = nodeId ? scene.nodeById.get(nodeId) : undefined;
            if (node) openNode(node);
          }}
          onMouseOver={(event) => {
            previewCone(nodeIdFromEvent(event));
            setHotEdge(edgeIndexFromEvent(event));
          }}
          onMouseLeave={() => {
            setHoverId(null);
            setHotEdge(null);
          }}
          // Keyboard parity with hover: focusing a node previews its cone.
          onFocus={(event) => {
            previewCone(nodeIdFromEvent(event));
          }}
          onBlur={(event) => {
            // Keep the preview while focus moves between nodes inside the
            // svg (Tab); only clear when focus leaves the graph entirely.
            if (
              event.relatedTarget instanceof Element &&
              event.currentTarget.contains(event.relatedTarget)
            ) {
              return;
            }
            setHoverId(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const nodeId = nodeIdFromEvent(event);
            if (!nodeId) return;
            event.preventDefault();
            togglePin(nodeId);
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

          {scene.links.map((link, index) => (
            <GraphEdgeItem
              key={`${link.from}→${link.to}`}
              link={link}
              index={index}
              tooltip={`${scene.nodeById.get(link.from)?.label ?? link.from}  →  ${
                scene.nodeById.get(link.to)?.label ?? link.to
              }\n${link.label}`}
              coneState={coneStateOf(cone ? cone.links.has(index) : undefined)}
              isHot={hotEdge === index}
            />
          ))}

          {scene.nodes.map((node) => (
            <GraphNodeItem
              key={node.id}
              node={node}
              coneState={coneStateOf(
                cone ? cone.nodes.has(node.id) : undefined,
              )}
              isPinned={pinnedId === node.id}
              isHot={hotLink?.from === node.id || hotLink?.to === node.id}
            />
          ))}
        </svg>
      </div>
    </div>
  );
});
