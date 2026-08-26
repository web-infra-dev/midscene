import { parseYamlScript } from '@/yaml/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tasks = `tasks:
  - name: Noop
    flow:
      - sleep: 0`;

describe('parseYamlScript Android deviceId normalization', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(process.env, 'ANDROID_DEVICE_ID');
  });

  it('preserves an unquoted numeric deviceId as an exact string', () => {
    const script = parseYamlScript(`android:
  deviceId: 00012345678901234567890 # physical device
${tasks}`);

    expect(script.android?.deviceId).toBe('00012345678901234567890');
    expect(console.warn).toHaveBeenCalledWith(
      '[Midscene]',
      'Numeric Android deviceId values are treated as strings. Quote deviceId in YAML, for example: deviceId: "00012345678901234567890".',
    );
  });

  it('preserves numeric environment substitutions and CRLF input', () => {
    process.env.ANDROID_DEVICE_ID = '00012345678901234567890';
    const script = parseYamlScript(
      [
        'android:',
        '    deviceId: ${ANDROID_DEVICE_ID} # physical device',
        'tasks:',
        '  - name: Noop',
        '    flow:',
        '      - sleep: 0',
      ].join('\r\n'),
    );

    expect(script.android?.deviceId).toBe('00012345678901234567890');
  });

  it.each(['789-abc', '123#serial'])(
    'does not rewrite the Android deviceId string %s',
    (deviceId) => {
      const script = parseYamlScript(`android:
  deviceId: ${deviceId}
${tasks}`);

      expect(script.android?.deviceId).toBe(deviceId);
      expect(console.warn).not.toHaveBeenCalled();
    },
  );

  it('does not rewrite numeric deviceId fields outside the Android target', () => {
    const script = parseYamlScript(`android:
  deviceId: 123
ios:
  deviceId: 456
${tasks}`);

    expect(script.android?.deviceId).toBe('123');
    expect(script.ios?.deviceId).toBe(456);
  });
});
