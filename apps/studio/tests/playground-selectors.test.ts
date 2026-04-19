import { describe, expect, it } from 'vitest';
import {
  buildAndroidDeviceItems,
  buildStudioSidebarDeviceBuckets,
  resolveAndroidDeviceLabel,
  resolveConnectedDeviceLabel,
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
      },
      {
        id: 'device-2',
        label: 'Pixel 8',
        description: undefined,
        selected: false,
        status: 'idle',
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
        },
        {
          id: 'device-2',
          label: 'Pixel 8',
          description: undefined,
          selected: false,
          status: 'idle',
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
