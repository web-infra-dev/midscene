import type React from 'react';
import { useState } from 'react';
import type { HistoryItem } from '../store';
import { ActionButtons } from './ActionButtons';
import { ConfigSelector } from './ConfigSelector';
import { HistorySelector } from './HistorySelector';
import type { RunType, ServiceModeType } from './playground-types';

interface ControlPanelProps {
  serviceMode: ServiceModeType;
  selectedType: RunType;
  dryMode: boolean;
  stoppable: boolean;
  runButtonEnabled: boolean;
  loading: boolean;
  onRun: () => void;
  onStop: () => void;
  onSelectHistory: (history: HistoryItem) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  serviceMode,
  selectedType,
  dryMode,
  stoppable,
  runButtonEnabled,
  loading,
  onRun,
  onStop,
  onSelectHistory,
}) => {
  const [hoveringSettings, setHoveringSettings] = useState(false);

  return (
    <div className="form-controller-wrapper">
      <div
        className={
          hoveringSettings
            ? 'settings-wrapper settings-wrapper-hover'
            : 'settings-wrapper'
        }
        onMouseEnter={() => setHoveringSettings(true)}
        onMouseLeave={() => setHoveringSettings(false)}
      >
        <HistorySelector onSelect={onSelectHistory} />
        <ConfigSelector serviceMode={serviceMode} />
      </div>
      <ActionButtons
        selectedType={selectedType}
        dryMode={dryMode}
        stoppable={stoppable}
        runButtonEnabled={runButtonEnabled}
        loading={loading}
        onRun={onRun}
        onStop={onStop}
      />
    </div>
  );
};
