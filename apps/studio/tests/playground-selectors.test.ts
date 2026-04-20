import { describe, expect, it } from 'vitest';
import {
  buildAndroidDeviceItems,
  buildDeviceSelectionFormValues,
  buildStudioSidebarDeviceBuckets,
  mergeSidebarDeviceBucketsWithDiscovery,
  resolveAndroidDeviceLabel,
  resolveConnectedDeviceId,
  resolveConnectedDeviceLabel,
  resolveSelectedDeviceId,
  resolveVisibleSidebarPlatforms,
} from '../src/renderer/playground/selectors';

describe('buildAndroidDeviceItems', () => {
  it('marks the connected Android target as active and selected', () => {
    const items = buildAndroidDeviceItems({
      formValues: {
        deviceId: 'device-2',
      },
      runtimeInfo: {
        interface: { type: 'android' },
        preview: { kind: 'none', capabilities: [] },
        executionUxHints: [],
        metadata: {
          deviceId: 'device-1',
          sessionDisplayName: 'Pixel 9',
        },
      },
      targets: [
        {
          id: 'device-1',
          label: 'Pixel 9',
        },
        {
          id: 'device-2',
          label: 'Pixel 8',
        },
      ],
    });

    expect(items).toEqual([
      {
        id: 'device-1',
        label: 'Pixel 9',
        description: undefined,
        selected: true,
        status: 'active',
        sessionValues: {
          deviceId: 'device-1',
        },
      },
      {
        id: 'device-2',
        label: 'Pixel 8',
        description: undefined,
        selected: false,
        status: 'idle',
        sessionValues: {
          deviceId: 'device-2',
        },
      },
    ]);
  });
});

describe('resolveVisibleSidebarPlatforms', () => {
  it('returns only platforms that currently have devices', () => {
    expect(
      resolveVisibleSidebarPlatforms({
        android: [
          {
            id: 'device-1',
            label: 'Pixel 9',
            selected: true,
            status: 'active',
          },
        ],
        ios: [],
        computer: [],
        harmony: [
          {
            id: 'HDC-001',
            label: 'Huawei P70',
            selected: true,
            status: 'active',
          },
        ],
        web: [],
      }),
    ).toEqual(['android', 'harmony']);
  });
});

describe('buildStudioSidebarDeviceBuckets', () => {
  it('only populates Android when the runtime is Android', () => {
    const buckets = buildStudioSidebarDeviceBuckets({
      formValues: {
        deviceId: 'device-2',
      },
      runtimeInfo: {
        interface: { type: 'android' },
        preview: { kind: 'none', capabilities: [] },
        executionUxHints: [],
        metadata: {
          deviceId: 'device-1',
          sessionDisplayName: 'Pixel 9',
        },
      },
      targets: [
        {
          id: 'device-1',
          label: 'Pixel 9',
        },
        {
          id: 'device-2',
          label: 'Pixel 8',
        },
      ],
    });

    expect(buckets).toEqual({
      android: [
        {
          id: 'device-1',
          label: 'Pixel 9',
          description: undefined,
          selected: true,
          status: 'active',
          sessionValues: {
            deviceId: 'device-1',
          },
        },
        {
          id: 'device-2',
          label: 'Pixel 8',
          description: undefined,
          selected: false,
          status: 'idle',
          sessionValues: {
            deviceId: 'device-2',
          },
        },
      ],
      ios: [],
      computer: [],
      harmony: [],
      web: [],
    });
  });

  it('does not fabricate device rows for inactive platforms', () => {
    const buckets = buildStudioSidebarDeviceBuckets({
      formValues: {},
      runtimeInfo: {
        platformId: 'harmonyos',
        title: 'Harmony Playground',
        interface: { type: 'harmonyos' },
        preview: { kind: 'none', capabilities: [] },
        executionUxHints: [],
        metadata: {
          deviceId: 'HDC-001',
          sessionDisplayName: 'Huawei P70',
        },
      },
      targets: [],
    });

    expect(buckets).toEqual({
      android: [],
      ios: [],
      computer: [],
      harmony: [
        {
          id: 'HDC-001',
          label: 'Huawei P70',
          description: 'HDC-001',
          selected: true,
          status: 'active',
          sessionValues: {
            deviceId: 'HDC-001',
          },
        },
      ],
      web: [],
    });
  });

  it('returns all sections empty when no runtime and no targets are available', () => {
    expect(
      buildStudioSidebarDeviceBuckets({
        formValues: {},
        runtimeInfo: null,
        targets: [],
      }),
    ).toEqual({
      android: [],
      ios: [],
      computer: [],
      harmony: [],
      web: [],
    });
  });
});

describe('resolveAndroidDeviceLabel', () => {
  it('falls back to the selected device label when not connected', () => {
    expect(
      resolveAndroidDeviceLabel([
        {
          id: 'device-2',
          label: 'Pixel 8',
          selected: true,
          status: 'idle',
        },
      ]),
    ).toBe('Pixel 8');
  });
});

describe('mergeSidebarDeviceBucketsWithDiscovery', () => {
  const emptyBuckets = {
    android: [],
    ios: [],
    computer: [],
    harmony: [],
    web: [],
  };

  it('returns session buckets unchanged when discovery has not polled yet', () => {
    const session = {
      ...emptyBuckets,
      android: [
        {
          id: 'device-1',
          label: 'Pixel 9',
          selected: true,
          status: 'active' as const,
        },
      ],
    };

    expect(mergeSidebarDeviceBucketsWithDiscovery(session, undefined)).toBe(
      session,
    );
  });

  it('drops a session item that is no longer discoverable (phone unplugged)', () => {
    const session = {
      ...emptyBuckets,
      android: [
        {
          id: 'device-1',
          label: 'Pixel 9',
          selected: true,
          status: 'active' as const,
        },
      ],
    };
    const discovered = {
      ...emptyBuckets,
      // device-1 has vanished from ADB
    };

    expect(
      mergeSidebarDeviceBucketsWithDiscovery(session, discovered).android,
    ).toEqual([]);
  });

  it('appends discovered devices that session setup has not surfaced', () => {
    const session = emptyBuckets;
    const discovered = {
      ...emptyBuckets,
      android: [
        {
          platformId: 'android' as const,
          id: 'device-2',
          label: 'Galaxy',
          description: 'ADB: device-2',
        },
      ],
    };

    expect(
      mergeSidebarDeviceBucketsWithDiscovery(session, discovered).android,
    ).toEqual([
      {
        id: 'device-2',
        label: 'Galaxy',
        description: 'ADB: device-2',
        selected: false,
        status: 'idle',
      },
    ]);
  });

  it('preserves manual iOS session rows while appending local WDA probes', () => {
    const session = {
      ...emptyBuckets,
      ios: [
        {
          id: 'remote-wda:8100',
          label: 'iPhone 15',
          selected: true,
          status: 'active' as const,
        },
      ],
    };
    const discovered = {
      ...emptyBuckets,
      ios: [
        {
          platformId: 'ios' as const,
          id: 'localhost:8100',
          label: 'iOS via WDA',
          description: 'WebDriverAgent: localhost:8100',
          sessionValues: {
            host: 'localhost',
            port: 8100,
          },
        },
      ],
    };

    expect(
      mergeSidebarDeviceBucketsWithDiscovery(session, discovered).ios,
    ).toEqual([
      {
        id: 'remote-wda:8100',
        label: 'iPhone 15',
        selected: true,
        status: 'active',
      },
      {
        id: 'localhost:8100',
        label: 'iOS via WDA',
        description: 'WebDriverAgent: localhost:8100',
        selected: false,
        status: 'idle',
        sessionValues: {
          host: 'localhost',
          port: 8100,
        },
      },
    ]);
  });

  it('appends local iOS WDA probes without evicting manual iOS sessions', () => {
    const session = {
      ...emptyBuckets,
      ios: [
        {
          id: 'remote-wda:8100',
          label: 'Remote iPhone',
          selected: true,
          status: 'active' as const,
        },
      ],
    };
    const discovered = {
      ...emptyBuckets,
      ios: [
        {
          platformId: 'ios' as const,
          id: 'localhost:8100',
          label: 'iOS via WDA',
          description: 'WebDriverAgent: localhost:8100',
          sessionValues: {
            host: 'localhost',
            port: 8100,
          },
        },
      ],
    };

    expect(
      mergeSidebarDeviceBucketsWithDiscovery(session, discovered).ios,
    ).toEqual([
      {
        id: 'remote-wda:8100',
        label: 'Remote iPhone',
        selected: true,
        status: 'active',
      },
      {
        id: 'localhost:8100',
        label: 'iOS via WDA',
        description: 'WebDriverAgent: localhost:8100',
        selected: false,
        status: 'idle',
        sessionValues: {
          host: 'localhost',
          port: 8100,
        },
      },
    ]);
  });
});

describe('resolveConnectedDeviceLabel', () => {
  const emptyOpts = { emptyLabel: 'No device' };

  it('returns emptyLabel when no runtime info is available', () => {
    expect(resolveConnectedDeviceLabel(null, emptyOpts)).toBe('No device');
  });

  it('prefers sessionDisplayName over raw device id', () => {
    expect(
      resolveConnectedDeviceLabel(
        {
          interface: { type: 'android' },
          preview: { kind: 'none', capabilities: [] },
          executionUxHints: [],
          metadata: {
            deviceId: 'emulator-5554',
            sessionDisplayName: 'Pixel 9',
          },
        },
        emptyOpts,
      ),
    ).toBe('Pixel 9');
  });

  it('falls back to deviceId when sessionDisplayName is absent', () => {
    expect(
      resolveConnectedDeviceLabel(
        {
          interface: { type: 'android' },
          preview: { kind: 'none', capabilities: [] },
          executionUxHints: [],
          metadata: { deviceId: 'emulator-5554' },
        },
        emptyOpts,
      ),
    ).toBe('emulator-5554');
  });

  it('labels computer displays using the displayId', () => {
    expect(
      resolveConnectedDeviceLabel(
        {
          interface: { type: 'computer' },
          preview: { kind: 'none', capabilities: [] },
          executionUxHints: [],
          metadata: { displayId: '1' },
        },
        emptyOpts,
      ),
    ).toBe('Display 1');
  });

  it('uses WDA host and port as the fallback iOS connection id', () => {
    expect(
      resolveConnectedDeviceId({
        interface: { type: 'ios' },
        preview: { kind: 'none', capabilities: [] },
        executionUxHints: [],
        metadata: {
          wdaHost: 'localhost',
          wdaPort: 8100,
        },
      }),
    ).toBe('localhost:8100');
  });

  it('falls back to runtime title when no device metadata is present', () => {
    expect(
      resolveConnectedDeviceLabel(
        {
          title: 'Midscene Playground',
          interface: { type: 'android' },
          preview: { kind: 'none', capabilities: [] },
          executionUxHints: [],
          metadata: {},
        },
        emptyOpts,
      ),
    ).toBe('Midscene Playground');
  });
});

describe('resolveSelectedDeviceId', () => {
  it('supports prefixed Android selection values', () => {
    expect(
      resolveSelectedDeviceId({
        platformId: 'android',
        'android.deviceId': 'device-2',
      }),
    ).toBe('device-2');
  });

  it('builds the iOS selection id from host and port', () => {
    expect(
      resolveSelectedDeviceId({
        platformId: 'ios',
        'ios.host': 'localhost',
        'ios.port': 8100,
      }),
    ).toBe('localhost:8100');
  });
});

describe('buildDeviceSelectionFormValues', () => {
  it('prefixes discovery-provided session values for iOS', () => {
    expect(
      buildDeviceSelectionFormValues('ios', {
        id: 'localhost:8100',
        sessionValues: {
          host: 'localhost',
          port: 8100,
        },
      }),
    ).toEqual({
      platformId: 'ios',
      'ios.host': 'localhost',
      'ios.port': 8100,
    });
  });
});
