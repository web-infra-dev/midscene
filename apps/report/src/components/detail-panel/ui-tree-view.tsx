import { SearchOutlined } from '@ant-design/icons';
import type { UITreeSnapshot, UiNode } from '@midscene/core';
import { Alert, Empty, Input, Tree } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildUITreeViewModel,
  estimateUITreeCanvasWidth,
  searchUITreeViewModel,
} from './ui-tree-data';

export function UITreeNodeDetails({ node }: { node: UiNode }) {
  return (
    <div className="ui-tree-node-details">
      <div className="ui-tree-node-details-title">{node.type}</div>
      <div className="ui-tree-node-details-section">Bounds</div>
      <table>
        <tbody>
          {Object.entries(node.bounds).map(([name, value]) => (
            <tr key={name}>
              <th>{name}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ui-tree-node-details-section">Attributes</div>
      <table>
        <tbody>
          {Object.entries(node.attrs).map(([name, value]) => (
            <tr key={name}>
              <th>{name}</th>
              <td>{value ?? 'undefined'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UITreeView({
  snapshot,
  error,
  embedded = false,
}: {
  snapshot?: UITreeSnapshot;
  error?: string;
  embedded?: boolean;
}) {
  const model = useMemo(
    () => (snapshot ? buildUITreeViewModel(snapshot) : null),
    [snapshot],
  );
  const [selectedKey, setSelectedKey] = useState<string>();
  const [searchText, setSearchText] = useState('');
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const searchResult = useMemo(
    () => (model ? searchUITreeViewModel(model, searchText) : null),
    [model, searchText],
  );
  const canvasWidth = useMemo(
    () => (model ? estimateUITreeCanvasWidth(model.treeData) : 640),
    [model],
  );
  const selectedNode = selectedKey
    ? model?.nodeByKey.get(selectedKey)
    : undefined;
  const hasTreeRows = Boolean(searchResult?.treeData.length);

  useEffect(() => {
    const viewport = horizontalScrollRef.current;
    if (!viewport) return;

    const handleHorizontalWheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaX) > 0
          ? event.deltaX
          : event.shiftKey
            ? event.deltaY
            : 0;
      if (delta === 0) return;

      const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
      const nextScrollLeft = Math.max(
        0,
        Math.min(maxScrollLeft, viewport.scrollLeft + delta),
      );
      if (nextScrollLeft !== viewport.scrollLeft) {
        viewport.scrollLeft = nextScrollLeft;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    viewport.addEventListener('wheel', handleHorizontalWheel, {
      passive: false,
    });
    return () => viewport.removeEventListener('wheel', handleHorizontalWheel);
  }, [hasTreeRows]);

  if (!snapshot || !model || !searchResult) {
    return error ? (
      <Alert
        type="error"
        showIcon
        message="UI tree capture failed"
        description={error}
      />
    ) : (
      <Empty description="No UI tree" />
    );
  }

  return (
    <div
      className={`ui-tree-view${embedded ? ' ui-tree-view-embedded' : ' scrollable'}`}
    >
      {error && (
        <Alert
          type="warning"
          showIcon
          message="UI tree capture warning"
          description={error}
        />
      )}
      <div className="ui-tree-toolbar">
        <Input
          className="ui-tree-search"
          aria-label="Search UI tree"
          allowClear
          placeholder="Search class, attribute, or value"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <div className="ui-tree-summary">
          {searchResult.query
            ? `${searchResult.matchCount} of ${model.nodeCount} nodes`
            : `${model.nodeCount} nodes`}{' '}
          · captured at {snapshot.capturedAt}
        </div>
      </div>
      <div className="ui-tree-columns">
        <div className="ui-tree-browser">
          {searchResult.treeData.length > 0 ? (
            <div
              className="ui-tree-horizontal-scroll"
              ref={horizontalScrollRef}
            >
              <div
                className="ui-tree-scroll-content"
                data-ui-tree-canvas-width={canvasWidth}
                style={{ width: canvasWidth }}
              >
                <Tree
                  key={searchResult.query || 'all-nodes'}
                  virtual
                  height={560}
                  treeData={searchResult.treeData}
                  defaultExpandedKeys={searchResult.expandedKeys}
                  selectedKeys={selectedKey ? [selectedKey] : []}
                  onSelect={(keys) => {
                    setSelectedKey(keys[0] ? String(keys[0]) : undefined);
                  }}
                />
              </div>
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No matching UI tree nodes"
            />
          )}
        </div>
        <div className="ui-tree-details">
          {selectedNode ? (
            <UITreeNodeDetails node={selectedNode} />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Select a UI tree node"
            />
          )}
        </div>
      </div>
    </div>
  );
}
