import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecFile = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: () => mockExecFile,
  };
});

// Must import after mocks are set up
const { HdcClient } = await import('../../src/hdc');

describe('HdcClient', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const hdc = new HdcClient({});
      expect(hdc).toBeDefined();
    });

    it('should accept custom hdcPath', () => {
      const hdc = new HdcClient({ hdcPath: '/custom/hdc' });
      expect(hdc).toBeDefined();
    });
  });

  describe('exec', () => {
    it('should execute hdc command without device id', async () => {
      mockExecFile.mockResolvedValue({ stdout: 'output', stderr: '' });

      const hdc = new HdcClient({});
      const result = await hdc.exec('list', 'targets');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['list', 'targets'],
        expect.any(Object),
      );
      expect(result).toBe('output');
    });

    it('should include -t flag when device id is specified', async () => {
      mockExecFile.mockResolvedValue({ stdout: 'output', stderr: '' });

      const hdc = new HdcClient({ deviceId: 'test-device' });
      const result = await hdc.exec('shell', 'ls');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['-t', 'test-device', 'shell', 'ls'],
        expect.any(Object),
      );
      expect(result).toBe('output');
    });

    it('should throw error on command failure', async () => {
      mockExecFile.mockRejectedValue(new Error('command failed'));

      const hdc = new HdcClient({});
      await expect(hdc.exec('invalid')).rejects.toThrow('HDC command failed');
    });
  });

  describe('shell', () => {
    it('should delegate to exec with shell prefix', async () => {
      mockExecFile.mockResolvedValue({ stdout: 'shell output', stderr: '' });

      const hdc = new HdcClient({});
      const result = await hdc.shell('ls /data');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', 'ls /data'],
        expect.any(Object),
      );
      expect(result).toBe('shell output');
    });
  });

  describe('forceStop', () => {
    it('should execute force-stop command', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'force stop process successfully.\n',
        stderr: '',
      });

      const hdc = new HdcClient({});
      await hdc.forceStop('com.example.app');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', 'aa force-stop com.example.app'],
        expect.any(Object),
      );
    });

    it('should throw when force-stop reports an error in stdout', async () => {
      mockExecFile.mockResolvedValue({
        stdout:
          'error: failed to force stop process.\nerror: get bundle info failed.\n',
        stderr: '',
      });

      const hdc = new HdcClient({});

      await expect(hdc.forceStop('com.bad.app')).rejects.toThrow(
        'Failed to force stop com.bad.app',
      );
    });
  });

  describe('click', () => {
    it('should execute uitest click command', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.click(100, 200);

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', 'uitest uiInput click 100 200'],
        expect.any(Object),
      );
    });
  });

  describe('swipe', () => {
    it('should execute uitest swipe command with speed', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.swipe(10, 10, 200, 200, 500);

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', 'uitest uiInput swipe 10 10 200 200 500'],
        expect.any(Object),
      );
    });

    it('should execute swipe without speed', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.swipe(10, 10, 200, 200);

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', 'uitest uiInput swipe 10 10 200 200'],
        expect.any(Object),
      );
    });
  });

  describe('getScreenInfo', () => {
    it('should parse screen size from RenderService output', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'render size: 1260x2720\nother info',
        stderr: '',
      });

      const hdc = new HdcClient({});
      const info = await hdc.getScreenInfo();

      expect(info).toEqual({ width: 1260, height: 2720 });
    });

    it('should parse screen size from RenderService output with render resolution', async () => {
      mockExecFile.mockResolvedValue({
        stdout: `-------------------------------[ability]-------------------------------


----------------------------------RenderService----------------------------------
-- ScreenInfo
screen[0]: id=0, powerStatus=POWER_STATUS_ON, backlight=11313, screenType=EXTERNAL_TYPE, render resolution=1216x2688, physical resolution=1216x2688, isVirtual=false, skipFrameInterval=1, expectedRefreshRate=-1, skipFrameStrategy=0
supportedMode[0]: 1216x2688, refreshRate=120
activeMode: 1216x2688, refreshRate=60`,
        stderr: '',
      });

      const hdc = new HdcClient({});
      const info = await hdc.getScreenInfo();

      expect(info).toEqual({ width: 1216, height: 2688 });
    });

    it('should throw if screen size cannot be parsed', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'no size info here',
        stderr: '',
      });

      const hdc = new HdcClient({});
      await expect(hdc.getScreenInfo()).rejects.toThrow(
        'Failed to get screen size',
      );
    });
  });

  describe('listTargets', () => {
    it('should parse device list', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'device-1\ndevice-2\n',
        stderr: '',
      });

      const hdc = new HdcClient({});
      const targets = await hdc.listTargets();

      expect(targets).toEqual(['device-1', 'device-2']);
    });

    it('should filter empty lines', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'device-1\n\n\ndevice-2\n',
        stderr: '',
      });

      const hdc = new HdcClient({});
      const targets = await hdc.listTargets();

      expect(targets).toEqual(['device-1', 'device-2']);
    });
  });

  describe('dumpLayout', () => {
    it('should dump and cat layout in a single shell round-trip and strip the preamble', async () => {
      mockExecFile.mockResolvedValue({
        stdout:
          'DumpLayout saved to:/data/local/tmp/midscene_layout.json\n{"attributes":{"type":"Root"},"children":[]}\n',
        stderr: '',
      });

      const hdc = new HdcClient({});
      const json = await hdc.dumpLayout();

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        [
          'shell',
          'uitest dumpLayout -p /data/local/tmp/midscene_layout.json && cat /data/local/tmp/midscene_layout.json',
        ],
        expect.any(Object),
      );
      expect(json.startsWith('{')).toBe(true);
      expect(JSON.parse(json)).toEqual({
        attributes: { type: 'Root' },
        children: [],
      });
    });

    it('should throw when the shell output contains no JSON body', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'uitest: cannot find display',
        stderr: '',
      });

      const hdc = new HdcClient({});
      await expect(hdc.dumpLayout()).rejects.toThrow('no JSON body');
    });
  });

  describe('clearTextField', () => {
    it('should chain 3-key batches with semicolons in a single shell call', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.clearTextField(7);

      // 7 Backspaces packed into 3+3+1 batches, chained with `;`
      const expected = [
        'uitest uiInput keyEvent 2055 2055 2055',
        'uitest uiInput keyEvent 2055 2055 2055',
        'uitest uiInput keyEvent 2055',
      ].join(';');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', expected],
        expect.any(Object),
      );
    });

    it('should cap each uitest invocation at 3 keyCodes (uitest limit)', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.clearTextField(100);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args[0]).toBe('shell');
      const cmds = args[1].split(';');
      // 100 keys / 3 per batch = 34 calls (33 full + 1 with a single key)
      expect(cmds).toHaveLength(34);
      for (const cmd of cmds) {
        const codes = cmd.replace('uitest uiInput keyEvent ', '').split(' ');
        expect(codes.length).toBeLessThanOrEqual(3);
        for (const c of codes) expect(c).toBe('2055');
      }
    });

    it('should no-op when length is 0', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.clearTextField(0);

      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });
});
