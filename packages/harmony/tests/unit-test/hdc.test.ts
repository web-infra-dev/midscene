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
});
