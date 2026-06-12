/**
 * Stories sidebar: a windowed (virtualized) tree of feature groups and the
 * flows group. Only the rows near the viewport render, so the 150+ scenario
 * suites scroll without jank; a pinned group header stands in for CSS
 * sticky headers (which cannot work with absolutely-positioned rows).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { plural, pluralize } from '../model/indices';
import type { TreeData, TreeEntry } from '../model/tree';

const HEAD_H = 34;
const ITEM_H = 30;
const OVERSCAN_PX = 240;

interface SidebarProps {
  tree: TreeData;
  query: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleGroup: (key: string) => void;
}

function entryHeight(entry: TreeEntry): number {
  return entry.type === 'head' ? HEAD_H : ITEM_H;
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <span className="tree-row-name">{name}</span>;
  const index = name.toLowerCase().indexOf(query);
  if (index === -1) return <span className="tree-row-name">{name}</span>;
  return (
    <span className="tree-row-name">
      {name.slice(0, index)}
      <mark>{name.slice(index, index + query.length)}</mark>
      {name.slice(index + query.length)}
    </span>
  );
}

function GroupHead({
  entry,
  pinned,
  onToggleGroup,
}: {
  entry: TreeEntry & { type: 'head' };
  pinned?: boolean;
  onToggleGroup: (key: string) => void;
}) {
  return (
    <button
      type="button"
      className={`tree-head${entry.flowsGroup ? ' flows-head' : ''}${
        pinned ? ' pinned' : ''
      }`}
      onClick={() => onToggleGroup(entry.key)}
      aria-expanded={entry.open}
      title={
        entry.flowsGroup
          ? 'Flows are reusable step sequences (@flow) that scenarios call as a single step'
          : undefined
      }
    >
      <span className={`caret${entry.open ? ' open' : ''}`} aria-hidden="true">
        ▸
      </span>
      <span className="tree-head-label">{entry.label}</span>
      <span className="count">{entry.count}</span>
    </button>
  );
}

export function Sidebar({
  tree,
  query,
  selectedId,
  onSelect,
  onToggleGroup,
}: SidebarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  const { entries } = tree;

  // Prefix offsets for the windowing math.
  const offsets = useMemo(() => {
    const out = new Array<number>(entries.length + 1);
    out[0] = 0;
    for (let i = 0; i < entries.length; i++) {
      out[i + 1] = out[i] + entryHeight(entries[i]);
    }
    return out;
  }, [entries]);
  const totalHeight = offsets[entries.length];

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setViewportH(scroller.clientHeight);
    const observer = new ResizeObserver(() => {
      setViewportH(scroller.clientHeight);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Keep the selected row in view when the selection changes elsewhere
  // (graph double-click, caller chips, health click-through).
  useEffect(() => {
    if (!selectedId) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const index = entries.findIndex(
      (entry) => entry.type !== 'head' && entry.item.id === selectedId,
    );
    if (index === -1) return;
    const top = offsets[index];
    const bottom = top + entryHeight(entries[index]);
    const viewTop = scroller.scrollTop + HEAD_H; // pinned header overlay
    const viewBottom = scroller.scrollTop + scroller.clientHeight;
    if (top < viewTop || bottom > viewBottom) {
      scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 2) });
    }
  }, [selectedId, entries, offsets]);

  const rangeStart = Math.max(0, scrollTop - OVERSCAN_PX);
  const rangeEnd = scrollTop + viewportH + OVERSCAN_PX;
  let firstIndex = 0;
  while (firstIndex < entries.length && offsets[firstIndex + 1] < rangeStart) {
    firstIndex++;
  }
  let lastIndex = firstIndex;
  while (lastIndex < entries.length && offsets[lastIndex] < rangeEnd) {
    lastIndex++;
  }

  // The group header governing the first on-screen row, pinned on top
  // (only once the list has actually scrolled).
  let pinnedHead: (TreeEntry & { type: 'head' }) | null = null;
  if (scrollTop > 0) {
    for (let i = 0; i < entries.length; i++) {
      if (offsets[i] > scrollTop) break;
      const entry = entries[i];
      if (entry.type === 'head') {
        pinnedHead = entry.open ? entry : null;
      }
    }
  }

  const slice = [];
  for (let i = firstIndex; i < lastIndex; i++) {
    const entry = entries[i];
    const top = offsets[i];
    if (entry.type === 'head') {
      slice.push(
        <div
          key={`head:${entry.key}`}
          className="tree-slot"
          style={{ top, height: HEAD_H }}
        >
          <GroupHead entry={entry} onToggleGroup={onToggleGroup} />
        </div>,
      );
      continue;
    }
    const item = entry.item;
    const active = item.id === selectedId;
    slice.push(
      <div key={item.id} className="tree-slot" style={{ top, height: ITEM_H }}>
        <button
          type="button"
          className={`tree-row ${entry.type}${active ? ' active' : ''}`}
          onClick={() => onSelect(item.id)}
          title={`${item.name}  (${item.uri}:${item.line})`}
        >
          <HighlightedName name={item.name} query={query} />
          {entry.type === 'scenario' ? (
            <>
              {entry.item.isOutline && (
                <span className="mini">×{entry.item.exampleCount}</span>
              )}
              {entry.item.tags.map((tag) => (
                <span key={tag} className="mini tag">
                  {tag}
                </span>
              ))}
            </>
          ) : (
            <>
              <span className="mini">
                {plural(entry.item.params.length, 'param')}
              </span>
              <span className="mini">
                {plural(entry.item.callers.length, 'caller')}
              </span>
            </>
          )}
        </button>
      </div>,
    );
  }

  return (
    <aside className="tree-pane">
      {query && (
        <output className="tree-summary">
          {tree.matchedScenarios + tree.matchedFlows === 0 ? (
            <>No matches</>
          ) : (
            <>
              <b>{tree.matchedScenarios}</b>{' '}
              {pluralize('scenario', tree.matchedScenarios)}
              {' · '}
              <b>{tree.matchedFlows}</b> {pluralize('flow', tree.matchedFlows)}
            </>
          )}
        </output>
      )}
      <div className="tree-viewport">
        {pinnedHead && (
          <div className="tree-pinned-head">
            <GroupHead
              entry={pinnedHead}
              pinned
              onToggleGroup={onToggleGroup}
            />
          </div>
        )}
        <div
          className="tree-scroll"
          ref={scrollerRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          {entries.length === 0 ? (
            <div className="tree-empty">
              {query ? `No matches for "${query}"` : 'No features found.'}
            </div>
          ) : (
            <div className="tree-canvas" style={{ height: totalHeight }}>
              {slice}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
