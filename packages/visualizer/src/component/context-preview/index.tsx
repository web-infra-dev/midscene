import type { UIContext } from '@midscene/core';
import { Button } from 'antd';
import type React from 'react';
import Blackboard from '../blackboard';
import { iconForStatus } from '../misc';
import DemoData from '../playground/playground-demo-ui-context.json';

interface ContextPreviewProps {
  uiContextPreview: UIContext | undefined;
  setUiContextPreview: (context: UIContext) => void;
  showContextPreview: boolean;
}

export const ContextPreview: React.FC<ContextPreviewProps> = ({
  uiContextPreview,
  setUiContextPreview,
  showContextPreview,
}) => {
  if (!showContextPreview) {
    return null;
  }

  return (
    <div className="form-part context-panel">
      <h3>UI Context</h3>
      {uiContextPreview ? (
        <Blackboard uiContext={uiContextPreview} hideController />
      ) : (
        <div>
          {iconForStatus('failed')} No UI context
          <Button
            type="link"
            onClick={(e) => {
              e.preventDefault();
              setUiContextPreview(DemoData as unknown as UIContext);
            }}
          >
            Load Demo
          </Button>
          <div>
            To load the UI context, you can either use the demo data above, or
            click the &apos;Send to Playground&apos; in the report page.
          </div>
        </div>
      )}
    </div>
  );
};
