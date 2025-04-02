import { SettingOutlined } from '@ant-design/icons';
import { Checkbox, Dropdown, type MenuProps, Space } from 'antd';
import type React from 'react';
import { useEnvConfig } from '../store/store';
import { trackingTip } from './playground-constants';
import type { ServiceModeType } from './playground-types';

interface ConfigSelectorProps {
  serviceMode: ServiceModeType;
}

export const ConfigSelector: React.FC<ConfigSelectorProps> = ({
  serviceMode,
}) => {
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );
  const setForceSameTabNavigation = useEnvConfig(
    (state) => state.setForceSameTabNavigation,
  );

  if (serviceMode !== 'In-Browser-Extension') {
    return null;
  }

  const configItems: MenuProps['items'] = [
    {
      label: (
        <Checkbox
          onChange={(e) => setForceSameTabNavigation(e.target.checked)}
          checked={forceSameTabNavigation}
        >
          {trackingTip}
        </Checkbox>
      ),
      key: 'config',
    },
  ];

  return (
    <div className="config-selector">
      <Dropdown menu={{ items: configItems }}>
        <Space>
          <SettingOutlined />
          {forceSameTabNavigation ? trackingTip : "don't track popup"}
        </Space>
      </Dropdown>
    </div>
  );
};
