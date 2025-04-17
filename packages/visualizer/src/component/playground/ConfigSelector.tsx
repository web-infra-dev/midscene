import { SettingOutlined } from '@ant-design/icons';
import { Checkbox, Dropdown, type MenuProps, Space } from 'antd';
import type React from 'react';
import { useEnvConfig } from '../store/store';
import { deepThinkTip, trackingTip } from './playground-constants';

interface ConfigSelectorProps {
  enableDeepThink: boolean;
  enableTracking: boolean;
}

export const ConfigSelector: React.FC<ConfigSelectorProps> = ({
  enableDeepThink = false,
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

  if (!enableTracking && !enableDeepThink) {
    return null;
  }

  const configItems: MenuProps['items'] = buildConfigItems();

  return (
    <div className="config-selector">
      <Dropdown menu={{ items: configItems }}>
        <Space>
          <SettingOutlined />
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

    if (enableDeepThink) {
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

    if (enableTracking && enableDeepThink) {
      displayParts.push('/');
    }

    if (enableDeepThink) {
      const deepThinkText = deepThink ? deepThinkTip : 'disable deep think';
      displayParts.push(deepThinkText);
    }

    return displayParts.join(' ');
  }
};
