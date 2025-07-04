import { Checkbox, Dropdown, type MenuProps } from 'antd';
import type React from 'react';
import SettingOutlined from '../../icons/setting.svg';
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
    <div className="selector-trigger">
      <Dropdown menu={{ items: configItems }} trigger={['click']}>
        <SettingOutlined width={24} height={24} />
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
};
