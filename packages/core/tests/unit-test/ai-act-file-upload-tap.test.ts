import { basename, join, resolve } from 'node:path';
import { Agent } from '@/agent';
import {
  FileChooserAccepter,
  normalizeFileChooserAcceptInAllowedDir,
} from '@/agent/file-chooser';
import { buildYamlFlowFromPlans } from '@/common';
import {
  actionTapParamSchema,
  defineActionRegisterFileChooserAccept,
} from '@/device';
import type { DeviceAction, PlanningAction } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const fixtureFile = join(__dirname, 'ai-act-file-upload-tap.test.ts');
type TestFileChooserHandler = (chooser: {
  accept(files: string[]): Promise<void>;
}) => Promise<void>;

describe('aiAct file chooser registration', () => {
  it('should serialize file chooser registration separately from Tap', () => {
    const register = vi.fn(async () => {});
    const plans: PlanningAction[] = [
      {
        type: 'RegisterFileChooserAccept',
        thought: 'prepare the id card file',
        param: {
          files: './fixtures/id-card.png',
        },
      },
      {
        type: 'Tap',
        thought: 'upload id card',
        param: {
          locate: { prompt: 'the id card upload button' },
        },
      },
    ];
    const actionSpace = [
      defineActionRegisterFileChooserAccept(register),
      {
        name: 'Tap',
        description: 'Tap the element',
        interfaceAlias: 'aiTap',
        paramSchema: actionTapParamSchema,
        call: vi.fn(),
      },
    ] as DeviceAction[];

    expect(buildYamlFlowFromPlans(plans, actionSpace)).toEqual([
      {
        registerFileChooserAccept: '',
        files: './fixtures/id-card.png',
      },
      {
        aiTap: '',
        locate: 'the id card upload button',
      },
    ]);
  });

  it('should replace registered files and clear the active registration', async () => {
    const registrations: Array<{
      handler: TestFileChooserHandler;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];
    const acceptedFiles: string[][] = [];
    const mockInterface = {
      interfaceType: 'playwright',
      registerFileChooserListener: vi.fn(
        async (handler: TestFileChooserHandler) => {
          const dispose = vi.fn();
          registrations.push({ handler, dispose });
          return { dispose, getError: () => undefined };
        },
      ),
    } as any;
    const accepter = new FileChooserAccepter(mockInterface);

    await accepter.register(fixtureFile);
    await accepter.register([fixtureFile]);

    expect(registrations[0].dispose).toHaveBeenCalledTimes(1);

    await registrations[1].handler({
      accept: async (files) => {
        acceptedFiles.push(files);
      },
    });

    expect(await accepter.clear()).toBeUndefined();

    expect(acceptedFiles).toEqual([[resolve(fixtureFile)]]);
    expect(registrations[1].dispose).toHaveBeenCalledTimes(1);
  });

  it('should return a file chooser handling error while disposing the registration', async () => {
    const uploadError = new Error('file upload failed');
    const dispose = vi.fn();
    const mockInterface = {
      interfaceType: 'playwright',
      registerFileChooserListener: vi.fn(async () => ({
        dispose,
        getError: () => uploadError,
      })),
    } as any;
    const accepter = new FileChooserAccepter(mockInterface);

    await accepter.register(fixtureFile);

    await expect(accepter.clear()).resolves.toBe(uploadError);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('only accepts model-generated paths within the configured directory', () => {
    expect(
      normalizeFileChooserAcceptInAllowedDir(basename(fixtureFile), __dirname),
    ).toEqual([resolve(fixtureFile)]);
    expect(
      normalizeFileChooserAcceptInAllowedDir(fixtureFile, __dirname),
    ).toEqual([resolve(fixtureFile)]);

    expect(() =>
      normalizeFileChooserAcceptInAllowedDir(
        '../../src/agent/agent.ts',
        __dirname,
      ),
    ).toThrow(/must be inside/);
  });

  it('registers model-generated paths within the configured directory', async () => {
    const acceptedFiles: string[][] = [];
    const mockInterface = {
      interfaceType: 'playwright',
      registerFileChooserListener: vi.fn(
        async (handler: TestFileChooserHandler) => ({
          dispose: vi.fn(),
          getError: () => undefined,
          handler,
        }),
      ),
    } as any;
    const accepter = new FileChooserAccepter(mockInterface);

    await accepter.registerFromAllowedDir(basename(fixtureFile), __dirname);
    const registration =
      await mockInterface.registerFileChooserListener.mock.results[0].value;
    await registration.handler({
      accept: async (files: string[]) => {
        acceptedFiles.push(files);
      },
    });

    expect(acceptedFiles).toEqual([[resolve(fixtureFile)]]);
  });

  it('requires fileChooserAllowedDir for model-driven uploads', async () => {
    const registerFileChooserListener = vi.fn(async () => ({
      dispose: vi.fn(),
      getError: () => undefined,
    }));
    const agent = new Agent(
      {
        interfaceType: 'playwright',
        actionSpace: () => [],
        registerFileChooserListener,
      } as any,
      {
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'test-model',
          MIDSCENE_MODEL_API_KEY: 'test-key',
        },
      },
    );
    const registerAction = (await agent.getActionSpace()).find(
      (action) => action.name === 'RegisterFileChooserAccept',
    );
    expect(registerAction).toBeDefined();

    const modelRuntime = {
      config: { slot: 'default' },
      adapter: {
        planning: {
          cacheEnabled: false,
          kind: 'default',
          supportsActionDeepLocate: true,
        },
      },
    };
    (agent as any).resolveModelRuntime = vi.fn(() => modelRuntime);
    (agent as any).resolveReplanningCycleLimit = vi.fn(() => 3);

    vi.spyOn(agent.taskExecutor, 'action').mockImplementation(async () => {
      await registerAction?.call({ files: basename(fixtureFile) });
      return { output: { output: 'uploaded', yamlFlow: [] } } as any;
    });

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(__dirname);
    try {
      await expect(agent.aiAct('Upload a file')).rejects.toThrow(
        /requires aiAct option fileChooserAllowedDir/,
      );
      expect(registerFileChooserListener).not.toHaveBeenCalled();

      await expect(
        agent.aiAct('Upload a file', { fileChooserAllowedDir: '.' }),
      ).resolves.toBe('uploaded');
      expect(registerFileChooserListener).toHaveBeenCalledTimes(1);
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
