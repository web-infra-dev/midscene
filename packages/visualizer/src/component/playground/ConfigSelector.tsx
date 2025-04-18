import { AimOutlined } from '@ant-design/icons';
import { Checkbox, Dropdown, type MenuProps, Space } from 'antd';
import type React from 'react';
import { useEnvConfig } from '../store/store';
import { deepThinkTip, trackingTip } from './playground-constants';

interface ConfigSelectorProps {
  showDeepThinkOption: boolean;
  enableTracking: boolean;
}

export const ConfigSelector: React.FC<ConfigSelectorProps> = ({
  showDeepThinkOption = false,
  enableTracking = false,
}) => {
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );
  const setForceSameTabNavigation = useEnvConfig(
    (state) => state.setForceSameTabNavigation,
  );
  const deepThink = useEnvConfig((state) => state.deepThink);
  const setDeepThink = useEnvConfig((state) => state.setDeepThink);

  if (!enableTracking && !showDeepThinkOption) {
    return null;
  }

  const configItems: MenuProps['items'] = buildConfigItems();

  return (
    <div className="config-selector">
      <Dropdown menu={{ items: configItems }}>
        <Space>
          <AimOutlined />
          {renderSettingsDisplay()}
        </Space>
      </Dropdown>
    </div>
  );

  function buildConfigItems() {
    const items = [];

    if (enableTracking) {
      items.push({
        label: (
          <Checkbox
            onChange={(e) => setForceSameTabNavigation(e.target.checked)}
            checked={forceSameTabNavigation}
          >
            {trackingTip}
          </Checkbox>
        ),
        key: 'track-config',
      });
    }

    if (showDeepThinkOption) {
      items.push({
        label: (
          <Checkbox
            onChange={(e) => {
              setDeepThink(e.target.checked);
            }}
            checked={deepThink}
          >
            {deepThinkTip}
          </Checkbox>
        ),
        key: 'deep-think-config',
      });
    }

    return items;
  }

  function renderSettingsDisplay() {
    const displayParts = [];

    if (enableTracking) {
      const trackingText = forceSameTabNavigation
        ? trackingTip
        : "don't track popup";
      displayParts.push(trackingText);
    }

    if (showDeepThinkOption && deepThink) {
      displayParts.push(deepThinkTip);
    }

    if (displayParts.length === 2) {
      displayParts.splice(1, 0, '/');
    }

    return displayParts.join(' ');
  }
};
