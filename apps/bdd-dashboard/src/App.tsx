import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailPane } from './components/DetailPane';
import { GraphView } from './components/GraphView';
import { Header } from './components/Header';
import { HealthView } from './components/HealthView';
import { Sidebar } from './components/Sidebar';
import { DASHBOARD_CLI_COMMAND } from './model/copy';
import { buildIndices } from './model/indices';
import { FLOWS_GROUP_KEY, buildTree } from './model/tree';
import type { DashboardView } from './model/types';
import { readExploreModel } from './useExploreModel';

export default function App() {
  const [model] = useState(readExploreModel);
  const indices = useMemo(() => buildIndices(model), [model]);

  const [view, setView] = useState<DashboardView>('stories');
  const [rawQuery, setRawQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const firstFeature = model.features.find(
      (feature) => feature.scenarios.length > 0,
    );
    return firstFeature?.scenarios[0]?.id ?? null;
  });

  const searchRef = useRef<HTMLInputElement>(null);
  const query = rawQuery.trim().toLowerCase();

  const tree = useMemo(
    () => buildTree(model, indices, query, collapsed),
    [model, indices, query, collapsed],
  );

  const selectItem = useCallback(
    (id: string) => {
      setSelectedId(id);
      // An active filter could hide the target row entirely (no active state,
      // no scroll-into-view), so cross-view jumps clear it.
      setRawQuery('');
      // Make sure the owning group is expanded so the row is visible.
      const feature = indices.featureOfScenario.get(id);
      if (feature) {
        setCollapsed((current) => ({ ...current, [feature.id]: false }));
      }
      if (indices.flowById.has(id)) {
        setCollapsed((current) => ({ ...current, [FLOWS_GROUP_KEY]: false }));
      }
      setView('stories');
    },
    [indices],
  );

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const clearSearch = useCallback(() => {
    setRawQuery('');
    searchRef.current?.blur();
  }, []);

  // Global keyboard map: "/" focuses search, 1/2/3 switch views, arrows
  // (and j/k) walk the visible story rows.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Checkboxes and buttons should not swallow shortcuts; only text
      // entry contexts do.
      const typing =
        target &&
        ((target.tagName === 'INPUT' &&
          !['checkbox', 'radio', 'button'].includes(
            (target as HTMLInputElement).type,
          )) ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setView('stories');
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '1') setView('stories');
      else if (event.key === '2') setView('graph');
      else if (event.key === '3') setView('health');
      else if (
        view === 'stories' &&
        (event.key === 'ArrowDown' ||
          event.key === 'ArrowUp' ||
          event.key === 'j' ||
          event.key === 'k')
      ) {
        const ids = tree.itemIds;
        if (ids.length === 0) return;
        event.preventDefault();
        const forward = event.key === 'ArrowDown' || event.key === 'j';
        const index = selectedId ? ids.indexOf(selectedId) : -1;
        const next =
          index === -1
            ? forward
              ? 0
              : ids.length - 1
            : Math.min(ids.length - 1, Math.max(0, index + (forward ? 1 : -1)));
        setSelectedId(ids[next]);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [view, tree, selectedId]);

  return (
    <div className="app">
      <Header
        model={model}
        view={view}
        onViewChange={setView}
        query={rawQuery}
        onQueryChange={setRawQuery}
        searchRef={searchRef}
        onSearchEscape={clearSearch}
      />

      <main>
        {/* All views stay mounted so graph pins / zoom / scroll survive tab
            switches, matching the legacy viewer's behavior. */}
        <section
          className="view view-stories"
          hidden={view !== 'stories'}
          aria-hidden={view !== 'stories'}
        >
          <Sidebar
            tree={tree}
            query={query}
            selectedId={selectedId}
            onSelect={selectItem}
            onToggleGroup={toggleGroup}
          />
          <DetailPane
            model={model}
            indices={indices}
            selectedId={selectedId}
            onSelect={selectItem}
          />
        </section>

        <section
          className="view view-graph"
          hidden={view !== 'graph'}
          aria-hidden={view !== 'graph'}
        >
          <GraphView
            model={model}
            indices={indices}
            onOpenInStories={selectItem}
          />
        </section>

        <section
          className="view view-health"
          hidden={view !== 'health'}
          aria-hidden={view !== 'health'}
        >
          <HealthView model={model} onSelect={selectItem} />
        </section>
      </main>

      <footer>
        Generated {model.generatedAt} — static snapshot of the feature files;
        regenerate with: <code>{DASHBOARD_CLI_COMMAND}</code>
      </footer>
    </div>
  );
}
