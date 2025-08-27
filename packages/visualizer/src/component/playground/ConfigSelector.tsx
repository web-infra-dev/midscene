import { Checkbox, Dropdown, type MenuProps, Radio } from 'antd';
import type React from 'react';
import SettingOutlined from '../../icons/setting.svg';
import { useEnvConfig } from '../store/store';
import {
  deepThinkTip,
  domIncludedTip,
  screenshotIncludedTip,
  trackingTip,
} from './playground-constants';
import './index.less';

interface ConfigSelectorProps {
  showDeepThinkOption: boolean;
  enableTracking: boolean;
  showDataExtractionOptions: boolean;
  hideDomAndScreenshotOptions?: boolean; // Hide domIncluded and screenshotIncluded options
}

export const ConfigSelector: React.FC<ConfigSelectorProps> = ({
  showDeepThinkOption = false,
  enableTracking = false,
  showDataExtractionOptions = false,
  hideDomAndScreenshotOptions = false,
}) => {
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );
  const setForceSameTabNavigation = useEnvConfig(
    (state) => state.setForceSameTabNavigation,
  );
  const deepThink = useEnvConfig((state) => state.deepThink);
  const setDeepThink = useEnvConfig((state) => state.setDeepThink);
  const screenshotIncluded = useEnvConfig((state) => state.screenshotIncluded);
  const setScreenshotIncluded = useEnvConfig(
    (state) => state.setScreenshotIncluded,
  );
  const domIncluded = useEnvConfig((state) => state.domIncluded);
  const setDomIncluded = useEnvConfig((state) => state.setDomIncluded);

  if (!enableTracking && !showDeepThinkOption && !showDataExtractionOptions) {
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

    if (showDataExtractionOptions && !hideDomAndScreenshotOptions) {
      items.push({
        label: (
          <Checkbox
            onChange={(e) => {
              setScreenshotIncluded(e.target.checked);
            }}
            checked={screenshotIncluded}
          >
            {screenshotIncludedTip}
          </Checkbox>
        ),
        key: 'screenshot-included-config',
      });

      items.push({
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ marginBottom: '4px', fontSize: '14px' }}>
              {domIncludedTip}
            </div>
            <Radio.Group
              size="small"
              value={domIncluded}
              onChange={(e) => setDomIncluded(e.target.value)}
            >
              <Radio value={false}>Off</Radio>
              <Radio value={true}>All</Radio>
              <Radio value={'visible-only'}>Visible only</Radio>
            </Radio.Group>
          </div>
        ),
        key: 'dom-included-config',
      });
    }

    return items;
  }
};
