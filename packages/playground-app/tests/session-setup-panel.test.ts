import type {
  PlaygroundSessionField,
  PlaygroundSessionSetup,
} from '@midscene/playground';
import { describe, expect, it } from 'vitest';
import { getPlatformSelectorOptions } from '../src/SessionSetupPanel';

const setup: PlaygroundSessionSetup = {
  fields: [],
  platformRegistry: [
    {
      id: 'android',
      label: 'Android',
      description: 'Connect to an Android device via ADB',
    },
    {
      id: 'ios',
      label: 'iOS',
      description: 'Connect to an iOS device via WebDriverAgent',
    },
    {
      id: 'computer',
      label: 'Computer',
      description: 'Control the local desktop',
    },
  ],
  platformSelector: {
    fieldKey: 'platformId',
    variant: 'cards',
  },
};

describe('SessionSetupPanel', () => {
  it('uses platform registry options only for the platform selector field', () => {
    const platformField: PlaygroundSessionField = {
      key: 'platformId',
      label: 'Platform',
      type: 'select',
      options: [{ label: 'Legacy platform', value: 'legacy' }],
    };
    const adbDeviceField: PlaygroundSessionField = {
      key: 'android.deviceId',
      label: 'ADB device',
      type: 'select',
      options: [
        {
          label: 's4ey59ytbitot4yp',
          value: 's4ey59ytbitot4yp',
          description: 'M2006J10C',
        },
      ],
    };

    expect(getPlatformSelectorOptions(platformField, setup)).toEqual([
      {
        label: 'Android',
        value: 'android',
        description: 'Connect to an Android device via ADB',
      },
      {
        label: 'iOS',
        value: 'ios',
        description: 'Connect to an iOS device via WebDriverAgent',
      },
      {
        label: 'Computer',
        value: 'computer',
        description: 'Control the local desktop',
      },
    ]);
    expect(getPlatformSelectorOptions(adbDeviceField, setup)).toEqual(
      adbDeviceField.options,
    );
  });
});
