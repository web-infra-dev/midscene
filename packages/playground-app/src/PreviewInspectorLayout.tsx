import React, { type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export function PreviewInspectorLayout({
  inspector,
  inspectorOpen,
  preview,
}: {
  inspector: ReactNode;
  inspectorOpen: boolean;
  preview: ReactNode;
}) {
  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={64} id="playground-preview" minSize={35} order={1}>
        {preview}
      </Panel>
      {inspectorOpen && (
        <>
          <PanelResizeHandle className="panel-resize-handle" />
          <Panel
            defaultSize={36}
            id="playground-inspector"
            minSize={24}
            order={2}
          >
            <div className="playground-extension-inspector">{inspector}</div>
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
