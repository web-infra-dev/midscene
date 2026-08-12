import * as nodeUtilActual from 'node:util' with { rstest: 'importActual' };
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockExecFile = rs.fn();

function commandResult(stdout: string) {
  return { stdout, stderr: '' };
}

function bundleDump(bundleInfo: Record<string, unknown>): string {
  return `com.example.app:\n${JSON.stringify(bundleInfo)}`;
}

function shellCommands(): string[] {
  return mockExecFile.mock.calls.map((call) => call[1][1] as string);
}

rs.mock('node:child_process', () => ({
  execFile: rs.fn(),
}));

rs.mock('node:util', () => ({
  ...nodeUtilActual,
  promisify: () => mockExecFile,
}));

// Must import after mocks are set up.
// @ts-ignore package tsconfig keeps module=ES2020 for build compatibility; this test intentionally uses top-level dynamic import so mocks are registered first.
const { HdcClient } = await import('../../src/hdc');

describe('HdcClient', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  afterEach(() => {
    rs.restoreAllMocks();
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

  describe('startAbility', () => {
    it('should include the module name when provided', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.startAbility('com.example.app', 'AppAbility', 'video');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', 'aa start -a AppAbility -b com.example.app -m video'],
        expect.any(Object),
      );
    });

    it('should omit the module flag when no module name is provided', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.startAbility('com.example.app', 'AppAbility');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        ['shell', 'aa start -a AppAbility -b com.example.app'],
        expect.any(Object),
      );
    });
  });

  describe('launchBundle', () => {
    it('should launch the declared main element from the entry module', async () => {
      mockExecFile
        .mockResolvedValueOnce(
          commandResult(
            bundleDump({
              entryModuleName: 'video',
              hapModuleInfos: [
                {
                  moduleName: 'feature',
                  moduleType: 2,
                  mainElementName: 'FeatureAbility',
                  abilityInfos: [{ name: 'FeatureAbility' }],
                },
                {
                  moduleName: 'video',
                  moduleType: 1,
                  mainElementName: 'AppAbility',
                  abilityInfos: [{ name: 'AppAbility' }],
                },
              ],
            }),
          ),
        )
        .mockResolvedValueOnce(commandResult(''));

      const hdc = new HdcClient({});
      await hdc.launchBundle('com.example.app');

      expect(shellCommands()).toEqual([
        'bm dump -n com.example.app',
        'aa start -a AppAbility -b com.example.app -m video',
      ]);
    });

    it.each([
      ['MainAbility', 'com.example.app.MainAbility'],
      ['com.example.app.MainAbility', 'MainAbility'],
    ])(
      'should match short and fully-qualified ability names: %s / %s',
      async (mainElementName, abilityName) => {
        mockExecFile
          .mockResolvedValueOnce(
            commandResult(
              bundleDump({
                mainEntry: 'entry',
                hapModuleInfos: [
                  {
                    moduleName: 'entry',
                    mainElementName,
                    abilityInfos: [{ name: abilityName }],
                  },
                ],
              }),
            ),
          )
          .mockResolvedValueOnce(commandResult(''));

        const hdc = new HdcClient({});
        await hdc.launchBundle('com.example.app');

        expect(shellCommands()).toEqual([
          'bm dump -n com.example.app',
          `aa start -a ${abilityName} -b com.example.app -m entry`,
        ]);
      },
    );

    it.each(['action.system.home', 'ohos.want.action.home'])(
      'should use the launcher skill when main element fields are absent: %s',
      async (homeAction) => {
        mockExecFile
          .mockResolvedValueOnce(
            commandResult(
              bundleDump({
                hapModuleInfos: [
                  {
                    moduleName: 'entry',
                    moduleType: 'entry',
                    abilityInfos: [
                      { name: 'UnrelatedAbility' },
                      {
                        name: 'LauncherAbility',
                        skills: [
                          {
                            actions: [homeAction],
                            entities: ['entity.system.home'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              }),
            ),
          )
          .mockResolvedValueOnce(commandResult(''));

        const hdc = new HdcClient({});
        await hdc.launchBundle('com.example.app');

        expect(shellCommands()).toEqual([
          'bm dump -n com.example.app',
          'aa start -a LauncherAbility -b com.example.app -m entry',
        ]);
      },
    );

    it('should prefer a launcher skill over an unrelated module main element', async () => {
      mockExecFile
        .mockResolvedValueOnce(
          commandResult(
            bundleDump({
              hapModuleInfos: [
                {
                  moduleName: 'feature',
                  mainElementName: 'FeatureAbility',
                  abilityInfos: [{ name: 'FeatureAbility' }],
                },
                {
                  moduleName: 'app',
                  abilityInfos: [
                    {
                      name: 'AppAbility',
                      skills: [
                        {
                          actions: ['action.system.home'],
                          entities: ['entity.system.home'],
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          ),
        )
        .mockResolvedValueOnce(commandResult(''));

      const hdc = new HdcClient({});
      await hdc.launchBundle('com.example.app');

      expect(shellCommands()).toEqual([
        'bm dump -n com.example.app',
        'aa start -a AppAbility -b com.example.app -m app',
      ]);
    });

    it('should ignore a main element that refers to an extension', async () => {
      mockExecFile
        .mockResolvedValueOnce(
          commandResult(
            bundleDump({
              entryModuleName: 'entry',
              hapModuleInfos: [
                {
                  moduleName: 'entry',
                  mainElementName: 'FormExtensionAbility',
                  extensionInfos: [{ name: 'FormExtensionAbility' }],
                  abilityInfos: [
                    {
                      name: 'AppAbility',
                      skills: [
                        {
                          actions: ['ohos.want.action.home'],
                          entities: ['entity.system.home'],
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          ),
        )
        .mockResolvedValueOnce(commandResult(''));

      const hdc = new HdcClient({});
      await hdc.launchBundle('com.example.app');

      expect(shellCommands()).toEqual([
        'bm dump -n com.example.app',
        'aa start -a AppAbility -b com.example.app -m entry',
      ]);
    });

    it('should cache a successful launch target', async () => {
      const dump = bundleDump({
        mainEntry: 'entry',
        hapModuleInfos: [
          {
            moduleName: 'entry',
            mainElementName: 'AppAbility',
            abilityInfos: [{ name: 'AppAbility' }],
          },
        ],
      });
      mockExecFile
        .mockResolvedValueOnce(commandResult(dump))
        .mockResolvedValueOnce(commandResult(''))
        .mockResolvedValueOnce(commandResult(''));

      const hdc = new HdcClient({});
      await hdc.launchBundle('com.example.app');
      await hdc.launchBundle('com.example.app');

      expect(shellCommands()).toEqual([
        'bm dump -n com.example.app',
        'aa start -a AppAbility -b com.example.app -m entry',
        'aa start -a AppAbility -b com.example.app -m entry',
      ]);
    });

    it('should refresh a stale cached target when the declaration changes', async () => {
      const entryDump = bundleDump({
        mainEntry: 'entry',
        hapModuleInfos: [
          {
            moduleName: 'entry',
            mainElementName: 'EntryAbility',
            abilityInfos: [{ name: 'EntryAbility' }],
          },
        ],
      });
      const appDump = bundleDump({
        mainEntry: 'video',
        hapModuleInfos: [
          {
            moduleName: 'video',
            mainElementName: 'AppAbility',
            abilityInfos: [{ name: 'AppAbility' }],
          },
        ],
      });
      mockExecFile
        .mockResolvedValueOnce(commandResult(entryDump))
        .mockResolvedValueOnce(commandResult(''))
        .mockResolvedValueOnce(commandResult('error: stale target'))
        .mockResolvedValueOnce(commandResult(appDump))
        .mockResolvedValueOnce(commandResult(''));

      const hdc = new HdcClient({});
      await hdc.launchBundle('com.example.app');
      await hdc.launchBundle('com.example.app');

      expect(shellCommands()).toEqual([
        'bm dump -n com.example.app',
        'aa start -a EntryAbility -b com.example.app -m entry',
        'aa start -a EntryAbility -b com.example.app -m entry',
        'bm dump -n com.example.app',
        'aa start -a AppAbility -b com.example.app -m video',
      ]);
    });

    it('should preserve an error and clear the cache when the target is unchanged', async () => {
      const dump = bundleDump({
        mainEntry: 'entry',
        hapModuleInfos: [
          {
            moduleName: 'entry',
            mainElementName: 'AppAbility',
            abilityInfos: [{ name: 'AppAbility' }],
          },
        ],
      });
      mockExecFile
        .mockResolvedValueOnce(commandResult(dump))
        .mockResolvedValueOnce(commandResult(''))
        .mockResolvedValueOnce(commandResult('error: connection lost'))
        .mockResolvedValueOnce(commandResult(dump))
        .mockResolvedValueOnce(commandResult(dump))
        .mockResolvedValueOnce(commandResult(''));

      const hdc = new HdcClient({});
      await hdc.launchBundle('com.example.app');
      await expect(hdc.launchBundle('com.example.app')).rejects.toThrow(
        'connection lost',
      );
      await hdc.launchBundle('com.example.app');

      expect(shellCommands()).toEqual([
        'bm dump -n com.example.app',
        'aa start -a AppAbility -b com.example.app -m entry',
        'aa start -a AppAbility -b com.example.app -m entry',
        'bm dump -n com.example.app',
        'bm dump -n com.example.app',
        'aa start -a AppAbility -b com.example.app -m entry',
      ]);
    });

    it('should throw when bundle information is malformed', async () => {
      mockExecFile.mockResolvedValueOnce(
        commandResult('error: failed to get bundle information'),
      );

      const hdc = new HdcClient({});

      await expect(hdc.launchBundle('com.example.app')).rejects.toThrow(
        'Cannot parse bundle information for com.example.app',
      );
    });

    it('should throw when bundle information contains invalid JSON', async () => {
      mockExecFile.mockResolvedValueOnce(commandResult('com.example.app: {'));

      const hdc = new HdcClient({});

      await expect(hdc.launchBundle('com.example.app')).rejects.toThrow(
        'Cannot parse bundle information for com.example.app',
      );
    });

    it('should throw rather than guessing an undeclared ability', async () => {
      mockExecFile.mockResolvedValueOnce(
        commandResult(
          bundleDump({
            hapModuleInfos: [
              {
                moduleName: 'entry',
                abilityInfos: [{ name: 'SomeAbility' }],
              },
            ],
          }),
        ),
      );

      const hdc = new HdcClient({});

      await expect(hdc.launchBundle('com.example.app')).rejects.toThrow(
        'Cannot find a launchable ability for com.example.app',
      );
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

    it('should reject a non-finite coordinate before invoking HDC', async () => {
      const hdc = new HdcClient({});

      await expect(hdc.click(Number.NaN, 200)).rejects.toThrow(
        'HDC x coordinate must be a non-negative finite number',
      );
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('should throw when uiInput reports invalid coordinates', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'Please confirm that the coordinate values are correct.\n',
        stderr: '',
      });

      const hdc = new HdcClient({});

      await expect(hdc.click(100, 200)).rejects.toThrow(
        'HDC uiInput click failed: Please confirm that the coordinate values are correct.',
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

    it.each([199, 40001, Number.NaN])(
      'should reject invalid swipe speed %s before invoking HDC',
      async (speed) => {
        const hdc = new HdcClient({});

        await expect(hdc.swipe(10, 10, 200, 200, speed)).rejects.toThrow(
          'HDC swipe speed must be a finite number between 200 and 40000',
        );
        expect(mockExecFile).not.toHaveBeenCalled();
      },
    );
  });

  describe('keyEvent', () => {
    it('should execute numeric and supported system key events', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const hdc = new HdcClient({});
      await hdc.keyEvent('2072', '2038');
      await hdc.keyEvent('Home');

      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        ['shell', 'uitest uiInput keyEvent 2072 2038'],
        expect.any(Object),
      );
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        ['shell', 'uitest uiInput keyEvent Home'],
        expect.any(Object),
      );
    });

    it.each(['RecentApps', 'F5', 'Control+A', ';'])(
      'should reject unsupported string key %s before invoking HDC',
      async (key) => {
        const hdc = new HdcClient({});

        await expect(hdc.keyEvent(key)).rejects.toThrow(
          `Invalid HDC key event: ${key}`,
        );
        expect(mockExecFile).not.toHaveBeenCalled();
      },
    );

    it('should reject an empty key event', async () => {
      const hdc = new HdcClient({});

      await expect(hdc.keyEvent()).rejects.toThrow(
        'HDC keyEvent requires between 1 and 3 keys',
      );
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('should reject more than three key events', async () => {
      const hdc = new HdcClient({});

      await expect(hdc.keyEvent('1', '2', '3', '4')).rejects.toThrow(
        'HDC keyEvent requires between 1 and 3 keys',
      );
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('should reject combining a system key with another key', async () => {
      const hdc = new HdcClient({});

      await expect(hdc.keyEvent('Home', '2054')).rejects.toThrow(
        'HDC system key events cannot be combined',
      );
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it.each([
      'Invalid parameters.',
      'Invalid parameters',
      'Missing parameter.',
      'Too many parameters.',
    ])('should throw when uitest reports: %s', async (message) => {
      mockExecFile.mockResolvedValue({
        stdout: `${message}\n\nUSAGE: keyEvent <keyID/Back/Home/Power>`,
        stderr: '',
      });

      const hdc = new HdcClient({});

      await expect(hdc.keyEvent('2094')).rejects.toThrow(
        `HDC uiInput keyEvent failed for 2094: ${message}`,
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
    it('should throw when a batched key event reports an error', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'Too many parameters.\n',
        stderr: '',
      });

      const hdc = new HdcClient({});

      await expect(hdc.clearTextField(4)).rejects.toThrow(
        'HDC uiInput clearTextField failed: Too many parameters.',
      );
    });

    it.each([-1, 1.5, Number.NaN])(
      'should reject invalid clear length %s before invoking HDC',
      async (length) => {
        const hdc = new HdcClient({});

        await expect(hdc.clearTextField(length)).rejects.toThrow(
          'HDC clearTextField length must be a non-negative safe integer',
        );
        expect(mockExecFile).not.toHaveBeenCalled();
      },
    );

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
