import { Checkbox, Dropdown, type MenuProps, Radio, Tooltip } from 'antd';
import type React from 'react';
import type { ReactNode } from 'react';
import SettingOutlined from '../../icons/setting.svg';
import { useEnvConfig } from '../../store/store';
import type { DeviceType } from '../../types';
import {
  alwaysRefreshScreenInfoTip,
  autoDismissKeyboardTip,
  deepLocateTip,
  deepThinkTip,
  domIncludedTip,
  imeStrategyTip,
  keyboardDismissStrategyTip,
  screenshotIncludedTip,
  trackingTip,
} from '../../utils/constants';
import {
  getDeviceCapabilities,
  hasDeviceSpecificConfig,
} from '../../utils/device-capabilities';

interface ConfigSelectorProps {
  showDeepLocateOption: boolean;
  showDeepThinkOption: boolean;
  enableTracking: boolean;
  showDataExtractionOptions: boolean;
  hideDomAndScreenshotOptions?: boolean; // Hide domIncluded and screenshotIncluded options
  deviceType?: DeviceType;
  trigger?: ReactNode;
  popupPlacement?: 'topRight' | 'bottomRight';
}

export const ConfigSelector: React.FC<ConfigSelectorProps> = ({
  showDeepLocateOption = false,
  showDeepThinkOption = false,
  enableTracking = false,
  showDataExtractionOptions = false,
  hideDomAndScreenshotOptions = false,
  deviceType,
  trigger,
  popupPlacement = 'bottomRight',
}) => {
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );
  const setForceSameTabNavigation = useEnvConfig(
    (state) => state.setForceSameTabNavigation,
  );
  const deepLocate = useEnvConfig((state) => state.deepLocate);
  const setDeepLocate = useEnvConfig((state) => state.setDeepLocate);
  const deepThink = useEnvConfig((state) => state.deepThink);
  const setDeepThink = useEnvConfig((state) => state.setDeepThink);
  const screenshotIncluded = useEnvConfig((state) => state.screenshotIncluded);
  const setScreenshotIncluded = useEnvConfig(
    (state) => state.setScreenshotIncluded,
  );
  const domIncluded = useEnvConfig((state) => state.domIncluded);
  const setDomIncluded = useEnvConfig((state) => state.setDomIncluded);

  // Device-specific configuration
  const imeStrategy = useEnvConfig((state) => state.imeStrategy);
  const setImeStrategy = useEnvConfig((state) => state.setImeStrategy);
  const autoDismissKeyboard = useEnvConfig(
    (state) => state.autoDismissKeyboard,
  );
  const setAutoDismissKeyboard = useEnvConfig(
    (state) => state.setAutoDismissKeyboard,
  );
  const keyboardDismissStrategy = useEnvConfig(
    (state) => state.keyboardDismissStrategy,
  );
  const setKeyboardDismissStrategy = useEnvConfig(
    (state) => state.setKeyboardDismissStrategy,
  );
  const alwaysRefreshScreenInfo = useEnvConfig(
    (state) => state.alwaysRefreshScreenInfo,
  );
  const setAlwaysRefreshScreenInfo = useEnvConfig(
    (state) => state.setAlwaysRefreshScreenInfo,
  );

  const deviceCapabilities = getDeviceCapabilities(deviceType);
  const hasDeviceOptions = hasDeviceSpecificConfig(deviceType);

  if (
    !enableTracking &&
    !showDeepLocateOption &&
    !showDeepThinkOption &&
    !showDataExtractionOptions &&
    !hasDeviceOptions
  ) {
    return null;
  }

  const configItems: MenuProps['items'] = buildConfigItems();

  return (
    <div className="selector-trigger">
      <Dropdown
        getPopupContainer={(triggerNode) => triggerNode.ownerDocument.body}
        menu={{ items: configItems }}
        overlayClassName="config-selector-dropdown"
        overlayStyle={{ zIndex: 10010 }}
        placement={popupPlacement}
        trigger={['click']}
      >
        {trigger ?? <SettingOutlined width={24} height={24} />}
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

    if (showDeepLocateOption) {
      items.push({
        label: (
          <Checkbox
            onChange={(e) => {
              setDeepLocate(e.target.checked);
            }}
            checked={deepLocate}
          >
            {deepLocateTip}
          </Checkbox>
        ),
        key: 'deep-locate-config',
      });
    }

    if (showDeepThinkOption) {
      items.push({
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ marginBottom: '4px', fontSize: '14px' }}>
              {deepThinkTip}
            </div>
            <Radio.Group
              size="small"
              value={deepThink}
              onChange={(e) => setDeepThink(e.target.value)}
            >
              <Tooltip title="Controlled by MIDSCENE_MODEL_REASONING_ENABLED env variable">
                <Radio value={'unset'}>Auto</Radio>
              </Tooltip>
              <Radio value={true}>On</Radio>
              <Radio value={false}>Off</Radio>
            </Radio.Group>
          </div>
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

    // Android-specific options
    if (deviceCapabilities.supportsImeStrategy) {
      items.push({
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ marginBottom: '4px', fontSize: '14px' }}>
              {imeStrategyTip}
            </div>
            <Radio.Group
              size="small"
              value={imeStrategy}
              onChange={(e) => setImeStrategy(e.target.value)}
            >
              <Radio value="always-yadb">Always YADB</Radio>
              <Radio value="yadb-for-non-ascii">YADB for non-ASCII</Radio>
            </Radio.Group>
          </div>
        ),
        key: 'ime-strategy-config',
      });

      if (deviceCapabilities.supportsAutoDismissKeyboard) {
        items.push({
          label: (
            <Checkbox
              onChange={(e) => setAutoDismissKeyboard(e.target.checked)}
              checked={autoDismissKeyboard}
            >
              {autoDismissKeyboardTip}
            </Checkbox>
          ),
          key: 'auto-dismiss-keyboard-config',
        });
      }

      if (deviceCapabilities.supportsKeyboardDismissStrategy) {
        items.push({
          label: (
            <div style={{ padding: '4px 0' }}>
              <div style={{ marginBottom: '4px', fontSize: '14px' }}>
                {keyboardDismissStrategyTip}
              </div>
              <Radio.Group
                size="small"
                value={keyboardDismissStrategy}
                onChange={(e) => setKeyboardDismissStrategy(e.target.value)}
              >
                <Radio value="esc-first">ESC first</Radio>
                <Radio value="back-first">Back first</Radio>
              </Radio.Group>
            </div>
          ),
          key: 'keyboard-dismiss-strategy-config',
        });
      }

      if (deviceCapabilities.supportsAlwaysRefreshScreenInfo) {
        items.push({
          label: (
            <Checkbox
              onChange={(e) => setAlwaysRefreshScreenInfo(e.target.checked)}
              checked={alwaysRefreshScreenInfo}
            >
              {alwaysRefreshScreenInfoTip}
            </Checkbox>
          ),
          key: 'always-refresh-screen-info-config',
        });
      }
    }

    if (
      !deviceCapabilities.supportsImeStrategy &&
      deviceCapabilities.supportsAutoDismissKeyboard
    ) {
      items.push({
        label: (
          <Checkbox
            onChange={(e) => setAutoDismissKeyboard(e.target.checked)}
            checked={autoDismissKeyboard}
          >
            {autoDismissKeyboardTip}
          </Checkbox>
        ),
        key: 'auto-dismiss-keyboard-config',
      });
    }

    return items;
  }
};
