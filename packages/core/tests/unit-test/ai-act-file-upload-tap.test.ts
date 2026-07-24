import { join, resolve } from 'node:path';
import { FileChooserAccepter } from '@/agent/file-chooser';
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
});
