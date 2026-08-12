import type {
  AndroidAuditOverlay,
  AndroidAuditTreeNode,
} from '@midscene/android';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAndroidAudit } from './AndroidAuditContext';
import { STATUS_DESCRIPTIONS, STATUS_LABELS } from './AndroidAuditOverlay';

function nodeIdentity(node: AndroidAuditTreeNode): string {
  return (
    node.attrs['resource-id'] ||
    node.attrs.text ||
    node.attrs['content-desc'] ||
    ''
  );
}

function statusClass(status: AndroidAuditOverlay['status']): string {
  return `status-${status}`;
}

function TreeNodeRow({
  flat,
  node,
  overlay,
  rowRef,
}: {
  flat: boolean;
  node: AndroidAuditTreeNode;
  overlay?: AndroidAuditOverlay;
  rowRef(element: HTMLButtonElement | null): void;
}) {
  const audit = useAndroidAudit();
  return (
    <button
      className={`android-audit-tree-row${audit.selectedNodeId === node.nodeId ? ' selected' : ''}`}
      onClick={() => {
        audit.setSelectedNodeId(node.nodeId);
        audit.setSelectedVisualElementId(undefined);
      }}
      ref={rowRef}
      style={{ paddingLeft: flat ? 10 : 10 + node.depth * 14 }}
      type="button"
    >
      <span className="tree-node-id">{node.nodeId}</span>
      <span className="tree-node-type">{node.type}</span>
      {nodeIdentity(node) && (
        <span className="tree-node-identity">{nodeIdentity(node)}</span>
      )}
      {overlay && (
        <span
          className={`tree-node-status ${statusClass(overlay.status)}`}
          title={overlay.statusReason}
        >
          {STATUS_LABELS[overlay.status]}
        </span>
      )}
    </button>
  );
}

function StatusLegend() {
  const entries = Object.entries(STATUS_LABELS) as Array<
    [keyof typeof STATUS_LABELS, string]
  >;
  return (
    <div className="android-audit-legend">
      {entries.map(([status, label]) => (
        <button
          aria-label={`${label}: ${STATUS_DESCRIPTIONS[status]}`}
          className={`legend-item status-${status}`}
          data-tooltip={STATUS_DESCRIPTIONS[status]}
          key={status}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function AndroidAuditInspector() {
  const audit = useAndroidAudit();
  const [query, setQuery] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const treeListRef = useRef<HTMLDivElement>(null);
  const treeNodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const handledSelectionRequestRef = useRef(0);

  useEffect(() => {
    audit.activate();
    return () => audit.deactivate();
  }, [audit.activate, audit.deactivate]);

  const overlayByNodeId = useMemo(
    () =>
      new Map(
        audit.state.overlays
          .filter((overlay) => overlay.nodeId)
          .map((overlay) => [overlay.nodeId, overlay]),
      ),
    [audit.state.overlays],
  );
  const visibleNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return audit.state.treeNodes.filter((node) => {
      const overlay = overlayByNodeId.get(node.nodeId);
      if (onlyProblems && (!overlay || overlay.status === 'cache-xpath-hit')) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [
        node.nodeId,
        node.type,
        node.attrs['resource-id'],
        node.attrs.text,
        node.attrs['content-desc'],
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [audit.state.treeNodes, onlyProblems, overlayByNodeId, query]);
  const selectedNode = audit.state.treeNodes.find(
    (node) => node.nodeId === audit.selectedNodeId,
  );
  const selectedVisual = audit.state.visualElements.find(
    (element) => element.id === audit.selectedVisualElementId,
  );
  const selectedOverlay = selectedNode
    ? overlayByNodeId.get(selectedNode.nodeId)
    : undefined;

  useEffect(() => {
    const selectedNodeId = audit.selectedNodeId;
    const selectionRequest = audit.selectionRequest;
    if (
      !selectedNodeId ||
      selectionRequest === 0 ||
      handledSelectionRequestRef.current === selectionRequest
    ) {
      return;
    }

    if (!visibleNodes.some((node) => node.nodeId === selectedNodeId)) {
      setQuery('');
      setOnlyProblems(false);
      return;
    }

    const frame = requestAnimationFrame(() => {
      const list = treeListRef.current;
      const row = treeNodeRefs.current.get(selectedNodeId);
      if (!list || !row) return;

      const listRect = list.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      list.scrollTo({
        behavior: 'smooth',
        top:
          list.scrollTop +
          rowRect.top -
          listRect.top -
          (list.clientHeight - rowRect.height) / 2,
      });
      handledSelectionRequestRef.current = selectionRequest;
    });

    return () => cancelAnimationFrame(frame);
  }, [audit.selectedNodeId, audit.selectionRequest, visibleNodes]);

  return (
    <aside className="android-audit-inspector">
      <header className="android-audit-header">
        <div>
          <h2>Android XPath Live Audit</h2>
          <p>
            {audit.state.source
              ? `${audit.state.source.source} · ${audit.state.source.durationMs} ms · ${audit.state.treeNodes.length} nodes · tree only`
              : 'Waiting for the first Accessibility tree'}
          </p>
        </div>
        <span
          className={`capture-state capture-${audit.state.status} ${audit.state.enabled ? 'is-live' : 'is-paused'}`}
        >
          {audit.state.status === 'capturing'
            ? 'Capturing'
            : audit.state.status === 'error'
              ? 'Paused'
              : audit.state.enabled
                ? 'Live'
                : 'Paused'}
        </span>
      </header>

      <div className="android-audit-toolbar">
        <button
          onClick={() =>
            void (audit.state.enabled ? audit.capture() : audit.resume())
          }
          type="button"
        >
          Recapture
        </button>
        <button
          className="primary"
          disabled={audit.downloadingReport}
          onClick={() => void audit.exportReport()}
          type="button"
        >
          {audit.downloadingReport ? 'Downloading…' : 'Download Report'}
        </button>
      </div>

      {audit.state.visualScan.status === 'scanning' && (
        <div aria-live="polite" className="android-audit-phase-state">
          {audit.state.visualScan.automatic
            ? 'Building the visual inventory for this WebView…'
            : 'Scanning visible controls…'}
        </div>
      )}

      {audit.state.visualScan.status === 'error' &&
        audit.state.visualScan.automatic &&
        audit.state.visualScan.error && (
          <div aria-live="polite" className="android-audit-phase-state">
            Automatic visual inventory was unavailable. Tree overlays remain
            active: {audit.state.visualScan.error}
          </div>
        )}

      {audit.lastDownloadedReport && (
        <div aria-live="polite" className="android-audit-phase-state">
          Report downloaded: <code>{audit.lastDownloadedReport}</code>
        </div>
      )}

      {(audit.error || audit.state.error) && (
        <div className="android-audit-error">
          {audit.error || audit.state.error}
          {audit.state.errorDetail && (
            <details>
              <summary>View Raw Error</summary>
              <pre>{audit.state.errorDetail}</pre>
            </details>
          )}
        </div>
      )}

      <StatusLegend />

      <section className="android-audit-tree-panel">
        <div className="tree-panel-title">
          <h3>Complete UiNode Tree</h3>
          <label>
            <input
              checked={onlyProblems}
              onChange={(event) => setOnlyProblems(event.target.checked)}
              type="checkbox"
            />
            Issues Only
          </label>
        </div>
        <input
          className="tree-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search id, text, desc, or type"
          type="search"
          value={query}
        />
        <div className="android-audit-tree-list" ref={treeListRef}>
          {visibleNodes.map((node) => (
            <TreeNodeRow
              flat={onlyProblems}
              key={node.nodeId}
              node={node}
              overlay={overlayByNodeId.get(node.nodeId)}
              rowRef={(element) => {
                if (element) treeNodeRefs.current.set(node.nodeId, element);
                else treeNodeRefs.current.delete(node.nodeId);
              }}
            />
          ))}
          {visibleNodes.length === 0 && (
            <div className="android-audit-empty">No matching nodes</div>
          )}
        </div>
      </section>

      <section className="android-audit-detail-panel">
        <h3>Element Details</h3>
        {selectedVisual ? (
          <>
            <div className="detail-heading">
              <strong>{selectedVisual.name}</strong>
              <span className={statusClass(selectedVisual.status)}>
                {STATUS_LABELS[selectedVisual.status]}
              </span>
            </div>
            {selectedVisual.statusReason && (
              <p className="detail-reason">{selectedVisual.statusReason}</p>
            )}
            <dl>
              <div>
                <dt>Rectangle Source</dt>
                <dd>{selectedVisual.rectSource}</dd>
              </div>
              <div>
                <dt>Mapped Node</dt>
                <dd>{selectedVisual.mappedNodeId ?? 'Not exposed'}</dd>
              </div>
              <div className="detail-full-row">
                <dt>Visual Rectangle</dt>
                <dd>
                  <code>{JSON.stringify(selectedVisual.rect)}</code>
                </dd>
              </div>
              <div className="detail-full-row">
                <dt>Structural XPath</dt>
                <dd>
                  <code>{selectedVisual.structuralXpath ?? 'None'}</code>
                </dd>
              </div>
            </dl>
            <details open>
              <summary>Midscene Cache XPath Candidates</summary>
              {selectedVisual.cacheFeatureXpaths.length ? (
                <ol>
                  {selectedVisual.cacheFeatureXpaths.map((xpath, index) => (
                    <li key={xpath}>
                      <span>
                        {selectedVisual.cacheFeatureXpathSources[index] ||
                          'Unknown source'}
                      </span>
                      <code>{xpath}</code>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No production cache XPath</p>
              )}
            </details>
          </>
        ) : selectedNode ? (
          <>
            <div className="detail-heading">
              <strong>{nodeIdentity(selectedNode) || selectedNode.type}</strong>
              {selectedOverlay && (
                <span className={statusClass(selectedOverlay.status)}>
                  {STATUS_LABELS[selectedOverlay.status]}
                </span>
              )}
            </div>
            {selectedOverlay?.statusReason && (
              <p className="detail-reason">{selectedOverlay.statusReason}</p>
            )}
            <dl>
              <div>
                <dt>Node</dt>
                <dd>{selectedNode.nodeId}</dd>
              </div>
              <div>
                <dt>Rectangle</dt>
                <dd>
                  <code>{JSON.stringify(selectedNode.bounds)}</code>
                </dd>
              </div>
              <div className="detail-full-row">
                <dt>Interaction Evidence</dt>
                <dd>
                  {selectedNode.interactionEvidence.length
                    ? selectedNode.interactionEvidence.join(', ')
                    : 'None'}
                </dd>
              </div>
              <div className="detail-full-row">
                <dt>Structural XPath</dt>
                <dd>
                  <code>{selectedNode.structuralXpath}</code>
                </dd>
              </div>
            </dl>
            <details open>
              <summary>Midscene Cache XPath Candidates</summary>
              {selectedNode.cacheFeatureXpaths.length ? (
                <ol>
                  {selectedNode.cacheFeatureXpaths.map((xpath, index) => (
                    <li key={xpath}>
                      <span>
                        {selectedNode.cacheFeatureXpathSources[index] ||
                          'Unknown source'}
                      </span>
                      <code>{xpath}</code>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No production cache XPath</p>
              )}
            </details>
            <details>
              <summary>Accessibility Attributes</summary>
              <pre>{JSON.stringify(selectedNode.attrs, null, 2)}</pre>
            </details>
          </>
        ) : (
          <div className="android-audit-empty">
            Select a frame or a node from the complete tree
          </div>
        )}
      </section>
    </aside>
  );
}
